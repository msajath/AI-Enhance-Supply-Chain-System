import { Router } from 'express';
import type session from 'express-session';
import { compare, hash, hashSync } from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { pool } from '../config/database';
import { createDefaultSessionStore, createSessionMiddleware, SESSION_COOKIE_NAME as cookieName, sessionCookie as cookie } from '../middleware/session';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';

const dummyHash = hashSync(randomBytes(32).toString('hex'), 12);
const roleNames: Record<string, string> = { ADMIN: 'Admin', WAREHOUSE_MANAGER: 'Warehouse manager', FLEET_MANAGER: 'Fleet manager', DRIVER: 'Driver' };
const roleCodeSchema = z.enum(['ADMIN', 'WAREHOUSE_MANAGER', 'FLEET_MANAGER', 'DRIVER']);
const credentialsSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
  // Optional portal the user is signing in to. The database role is always authoritative.
  role: roleCodeSchema.optional(),
}).strict();
const accessRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255).transform(value => value.toLowerCase()),
  organizationCode: z.string().trim().min(1).max(50),
  // Admin accounts can never be requested from the public form.
  requestedRole: z.enum(['WAREHOUSE_MANAGER', 'FLEET_MANAGER', 'DRIVER']),
  password: z.string().min(12).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
}).strict();
const jwtSignOptions: SignOptions = {
  algorithm: 'HS256',
  expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
};

// Audit events are best-effort: a logging failure must never block sign in.
async function recordAuthEvent(actorId: string, eventType: string, metadata: Record<string, unknown>) {
  try {
    await pool.query('INSERT INTO system_audit_logs (actor_id, event_type, module, metadata) VALUES ($1, $2, $3, $4)', [actorId, eventType, 'auth', JSON.stringify(metadata)]);
  } catch (error) {
    logger.warn('Unable to record auth audit event', { eventType, error: (error as Error).message });
  }
}

function publicUser(row: { id: string; email: string; full_name: string; role: string }) {
  return { id: row.id, email: row.email, full_name: row.full_name, role: roleNames[row.role] };
}

function bearerToken(req: import('express').Request): string | undefined {
  const header = req.get('Authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

async function authenticatedUser(req: import('express').Request) {
  const token = bearerToken(req);
  if (!token) return undefined;
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }) as JwtPayload;
  if (typeof decoded.sub !== 'string') return undefined;
  const result = await pool.query('SELECT id, email, full_name, role, is_active, auth_version FROM users WHERE id = $1 LIMIT 1', [decoded.sub]);
  const row = result.rows[0];
  return row?.is_active && roleNames[row.role] && (decoded.av ?? 0) === (row.auth_version ?? 0) ? row : undefined;
}

export function createAuthRouter(store?: session.Store) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // PostgreSQL sessions survive API restarts; tests may inject an isolated store.
  router.use(createSessionMiddleware(store ?? createDefaultSessionStore()));
  router.use((req, res, next) => {
    if (req.method === 'POST') {
      const origin = req.get('Origin');
      if (req.get('Sec-Fetch-Site') === 'cross-site' || origin && ![env.CORS_ORIGIN, ...(env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'])].includes(origin)) {
        res.status(403).json(ApiResponse.error('Request origin is not allowed.', 'FORBIDDEN')); return;
      }
    }
    next();
  });
  router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: ApiResponse.error('Too many sign-in attempts. Please try again later.', 'RATE_LIMITED') }), async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json(ApiResponse.error('Enter a valid email and password.', 'INVALID_INPUT')); return; }
    try {
      const result = await pool.query('SELECT id, email, password_hash, full_name, role, is_active, auth_version FROM users WHERE lower(email) = lower($1) LIMIT 1', [parsed.data.email]);
      const row = result.rows[0];
      // Always perform a password hash comparison, including for unknown accounts.
      const matches = await compare(parsed.data.password, row?.password_hash ?? dummyHash);
      const role = row && roleNames[row.role];
      if (!matches || !row?.is_active || !role) {
        res.status(401).json(ApiResponse.error('Email or password is incorrect.', 'INVALID_CREDENTIALS')); return;
      }
      // Role-based login: the selected portal must match the account's assigned role.
      if (parsed.data.role && parsed.data.role !== row.role) {
        res.status(403).json(ApiResponse.error(`This account does not have ${roleNames[parsed.data.role]} access.`, 'ROLE_MISMATCH')); return;
      }
      await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.userId = row.id;
      req.session.authVersion = row.auth_version ?? 0;
      await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      await recordAuthEvent(row.id, 'USER_LOGIN', { role: row.role });
      const accessToken = jwt.sign({ sub: row.id, av: row.auth_version ?? 0 }, env.JWT_SECRET, jwtSignOptions);
      const tokenPayload = jwt.decode(accessToken) as JwtPayload;
      res.json(ApiResponse.success({
        accessToken,
        tokenType: 'Bearer',
        expiresIn: (tokenPayload.exp ?? 0) - (tokenPayload.iat ?? 0),
        user: publicUser(row),
      }, 'Login successful'));
    } catch { res.status(503).json(ApiResponse.error('Sign-in service is unavailable. Please try again later.', 'AUTH_UNAVAILABLE')); }
  });
  router.post('/signup', (_req,res) => { res.status(403).json(ApiResponse.error('Accounts must be provisioned by an administrator.', 'FORBIDDEN')); });
  // Public "Request an account" form. A request grants nothing: an administrator of the
  // company must approve it (Admin > Access requests). Problems are reported clearly
  // (unknown company code, existing account, request already waiting) so people are not
  // told "sent" when nothing reached the administrator. The rate limit keeps this from
  // being used to test many emails.
  router.post('/access-requests', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: ApiResponse.error('Too many requests. Please try again in 15 minutes.', 'RATE_LIMITED') }), async (req, res) => {
    const parsed = accessRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json(ApiResponse.error('Check your name, email, company code, role and password (at least 12 characters).', 'INVALID_INPUT')); return; }
    const v = parsed.data;
    try {
      const org = (await pool.query('SELECT id FROM organizations WHERE upper(code) = upper($1) LIMIT 1', [v.organizationCode])).rows[0];
      if (!org) { res.status(404).json(ApiResponse.error('We could not find that company code. Check it with your administrator.', 'COMPANY_NOT_FOUND')); return; }
      if ((await pool.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [v.email])).rowCount) {
        res.status(409).json(ApiResponse.error('An account with this email already exists. Sign in instead, or ask your administrator to reset the password.', 'ACCOUNT_EXISTS')); return;
      }
      const passwordHash = await hash(v.password, 12);
      const created = await pool.query(
        `INSERT INTO access_requests (organization_id, email, full_name, requested_role, password_hash)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
        [org.id, v.email, v.fullName, v.requestedRole, passwordHash]);
      if (!created.rowCount) { res.status(409).json(ApiResponse.error('You already have a request waiting for approval. Your administrator will review it.', 'REQUEST_PENDING')); return; }
      try {
        await pool.query('INSERT INTO system_audit_logs (actor_id, event_type, module, metadata) VALUES (NULL, $1, $2, $3)',
          ['ACCESS_REQUESTED', 'auth', JSON.stringify({ organization_id: org.id, request_id: created.rows[0].id, requested_role: v.requestedRole })]);
      } catch (error) { logger.warn('Unable to record access request audit event', { error: (error as Error).message }); }
      res.status(202).json(ApiResponse.success(null, 'Your request has been sent to your administrator.'));
    } catch (error) {
      logger.error('Access request failed', { error: (error as Error).message });
      res.status(503).json(ApiResponse.error('The request service is unavailable. Please try again later.', 'AUTH_UNAVAILABLE'));
    }
  });
  router.get(['/session', '/me'], async (req, res) => {
    if (!req.session.userId && bearerToken(req)) {
      try { const row = await authenticatedUser(req); if (row) { res.json(ApiResponse.success({user:publicUser(row)})); return; } } catch { /* Invalid bearer tokens are unauthenticated. */ }
    }
    if (!req.session.userId) { res.status(401).json(ApiResponse.error('Authentication required.', 'UNAUTHENTICATED')); return; }
    try {
      const result = await pool.query('SELECT id, email, full_name, role, is_active, auth_version FROM users WHERE id = $1', [req.session.userId]);
      const row = result.rows[0];
      const role = row && roleNames[row.role];
      if (!row?.is_active || !role || (row.auth_version ?? 0) !== (req.session.authVersion ?? 0)) {
        await new Promise<void>((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
        res.clearCookie(cookieName, { path: cookie.path, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite });
        res.status(401).json(ApiResponse.error('Authentication required.', 'UNAUTHENTICATED')); return;
      }
      res.json(ApiResponse.success({ user: publicUser(row) }));
    } catch { res.status(503).json(ApiResponse.error('Session service is unavailable.', 'AUTH_UNAVAILABLE')); }
  });
  router.post('/logout', async (req, res) => {
    try { const userId=req.session.userId ?? (await authenticatedUser(req))?.id; if (userId) await pool.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [userId]); }
    catch { res.status(503).json(ApiResponse.error('Unable to sign out. Please try again.', 'AUTH_UNAVAILABLE')); return; }
    req.session.destroy(error => {
      if (error) { res.status(503).json(ApiResponse.error('Unable to sign out. Please try again.', 'AUTH_UNAVAILABLE')); return; }
      res.clearCookie(cookieName, { path: cookie.path, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite });
      res.json(ApiResponse.success(null, 'Signed out'));
    });
  });
  // Session-store failures must never expose implementation details.
  router.use((_error: unknown, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => {
    res.status(503).json(ApiResponse.error('Authentication service is unavailable.', 'AUTH_UNAVAILABLE'));
  });
  return router;
}
