import type { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload, TokenExpiredError } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { isRole, Role } from '../auth/permissions';
import { findUserForAuth } from '../modules/organization/organization.repository';

/** Who is calling, loaded fresh from the database on every request. */
export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  organizationId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function bearerToken(req: Request): string | undefined {
  const header = req.get('Authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

function unauthenticated(res: Response, code = 'UNAUTHENTICATED', message = 'Authentication required.') {
  res.status(401).json(ApiResponse.error(message, code));
}

/**
 * requireAuth — accepts either the HttpOnly session cookie (web app) or a
 * `Authorization: Bearer <JWT>` header (API clients/tests).
 * The role and company always come from the users table, never from the token or
 * request body, so a demoted or disabled user loses access on the next request.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  let userId: string | undefined;
  let version = req.session?.authVersion ?? 0;
  const token = bearerToken(req);

  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      }) as JwtPayload;
      version = typeof decoded.av === 'number' ? decoded.av : 0;
      userId = typeof decoded.sub === 'string' ? decoded.sub : undefined;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        unauthenticated(res, 'TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');
      } else {
        unauthenticated(res, 'INVALID_TOKEN');
      }
      return;
    }
  } else {
    userId = req.session?.userId;
  }

  if (!userId) {
    unauthenticated(res);
    return;
  }

  try {
    const user = await findUserForAuth(userId);
    if (!user || !user.is_active || !isRole(user.role) || (user.auth_version ?? 0) !== version) {
      unauthenticated(res);
      return;
    }
    if (!user.organization_id) {
      // A user that is not linked to a company has no scope at all.
      res.status(403).json(ApiResponse.error('Your account is not assigned to a company.', 'FORBIDDEN'));
      return;
    }
    req.auth = { userId: user.id, email: user.email, role: user.role, organizationId: user.organization_id };
    next();
  } catch (error) {
    logger.error('Authentication lookup failed', { error: (error as Error).message });
    res.status(503).json(ApiResponse.error('Authentication service is unavailable.', 'AUTH_UNAVAILABLE'));
  }
}
