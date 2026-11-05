import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import type { Role } from '../auth/permissions';
import { canAccessProject, insertAccessDeniedAudit } from '../modules/organization/organization.repository';

/**
 * Role guard + project-scope middleware (Jira AESCS-39 / AESCS-43, Member 1).
 *
 *   router.get('/projects/:projectId',
 *     requireAuth,
 *     requireRole('ADMIN', 'WAREHOUSE_MANAGER'),
 *     requireProjectAccess((req) => req.params.projectId),
 *     handler);
 *
 * Both guards answer 403 FORBIDDEN and write an ACCESS_DENIED row to
 * system_audit_logs. Cross-project requests get the same 403 whether the project
 * exists or not, so callers cannot probe for other companies' project IDs.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Logs and audits a denial. Never throws: an audit failure must not turn a 403 into a 500. */
export async function recordAccessDenied(
  req: Request,
  reason: 'ROLE_NOT_PERMITTED' | 'PROJECT_OUT_OF_SCOPE',
  details: { projectId?: string; requiredRoles?: readonly string[] } = {}
): Promise<void> {
  const event = {
    actorId: req.auth?.userId ?? null,
    reason,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    role: req.auth?.role,
    ...details,
  };
  logger.warn('Access denied', event);
  try {
    await insertAccessDeniedAudit(event);
  } catch (error) {
    logger.error('Failed to write access-denied audit record', { error: (error as Error).message });
  }
}

function forbidden(res: Response, message: string) {
  res.status(403).json(ApiResponse.error(message, 'FORBIDDEN'));
}

/** Allows the request only if the authenticated user's role is in `roles`. Run after requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  if (roles.length === 0) throw new Error('requireRole needs at least one role');
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json(ApiResponse.error('Authentication required.', 'UNAUTHENTICATED'));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      await recordAccessDenied(req, 'ROLE_NOT_PERMITTED', { requiredRoles: roles });
      forbidden(res, 'You do not have permission to perform this action.');
      return;
    }
    next();
  };
}

export interface ProjectAccessOptions {
  /** When true, a missing project ID is allowed (e.g. GET /sites without ?projectId). */
  optional?: boolean;
}

/**
 * Allows the request only if the project ID returned by `getProjectId` is inside the
 * caller's scope (same company AND, for scoped roles, an explicit grant).
 */
export function requireProjectAccess(
  getProjectId: (req: Request) => unknown,
  options: ProjectAccessOptions = {}
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json(ApiResponse.error('Authentication required.', 'UNAUTHENTICATED'));
      return;
    }
    const projectId = getProjectId(req);
    if (projectId === undefined || projectId === '') {
      if (options.optional) {
        next();
        return;
      }
      res.status(400).json(ApiResponse.error('A project ID is required.', 'VALIDATION_ERROR'));
      return;
    }
    if (!isUuid(projectId)) {
      res.status(400).json(ApiResponse.error('Project ID must be a valid UUID.', 'VALIDATION_ERROR'));
      return;
    }
    try {
      if (!(await canAccessProject(req.auth, projectId))) {
        await recordAccessDenied(req, 'PROJECT_OUT_OF_SCOPE', { projectId });
        forbidden(res, 'You do not have access to this project.');
        return;
      }
    } catch (error) {
      logger.error('Project scope check failed', { error: (error as Error).message });
      res.status(503).json(ApiResponse.error('Authorization service is unavailable.', 'AUTHZ_UNAVAILABLE'));
      return;
    }
    next();
  };
}
