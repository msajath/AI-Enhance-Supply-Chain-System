import { Router } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { compare, hashSync } from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { pool } from '../config/database';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';

declare module 'express-session' { interface SessionData { userId?: string } }
const cookieName = 'qorvenz.sid';
const cookie = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 8 * 60 * 60 * 1000 };
const devSecret = randomBytes(32).toString('hex');
const dummyHash = hashSync(randomBytes(32).toString('hex'), 12);
const roleNames: Record<string, string> = { ADMIN: 'Admin', WAREHOUSE_MANAGER: 'Warehouse manager', DRIVER: 'Driver' };
const credentialsSchema = z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72) }).strict();

export function createAuthRouter(store?: session.Store) {
  const router = Router();
  const secret = process.env.SESSION_SECRET || (env.NODE_ENV === 'production' ? '' : devSecret);
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // PostgreSQL sessions survive API restarts; tests may inject an isolated store.
  router.use(session({ name: cookieName, secret, store: store ?? new (connectPgSimple(session))({ pool, createTableIfMissing: true }), resave: false, saveUninitialized: false, cookie }));
  router.use((req, res, next) => {
    if (req.method === 'POST') {
      const origin = req.get('Origin');
      if (origin && ![env.CORS_ORIGIN, ...(env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'])].includes(origin)) {
        res.status(403).json(ApiResponse.error('Request origin is not allowed.', 'FORBIDDEN')); return;
      }
    }
    next();
  });
  router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: ApiResponse.error('Too many sign-in attempts. Please try again later.', 'RATE_LIMITED') }), async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json(ApiResponse.error('Enter a valid email and password.', 'INVALID_INPUT')); return; }
    try {
      const result = await pool.query('SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE lower(email) = lower($1) LIMIT 1', [parsed.data.email]);
      const row = result.rows[0];
      // Always perform a password hash comparison, including for unknown accounts.
      const matches = await compare(parsed.data.password, row?.password_hash ?? dummyHash);
      const role = row && roleNames[row.role];
      if (!matches || !row?.is_active || !role) {
        res.status(401).json(ApiResponse.error('Email or password is incorrect.', 'INVALID_CREDENTIALS')); return;
      }
      await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.userId = row.id;
      await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      res.json(ApiResponse.success({ user: { id: row.id, email: row.email, full_name: row.full_name, role } }));
    } catch { res.status(503).json(ApiResponse.error('Sign-in service is unavailable. Please try again later.', 'AUTH_UNAVAILABLE')); }
  });
  router.get('/session', async (req, res) => {
    if (!req.session.userId) { res.status(401).json(ApiResponse.error('Authentication required.', 'UNAUTHENTICATED')); return; }
    try {
      const result = await pool.query('SELECT id, email, full_name, role, is_active FROM users WHERE id = $1', [req.session.userId]);
      const row = result.rows[0];
      const role = row && roleNames[row.role];
      if (!row?.is_active || !role) {
        await new Promise<void>((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
        res.clearCookie(cookieName, { path: cookie.path, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite });
        res.status(401).json(ApiResponse.error('Authentication required.', 'UNAUTHENTICATED')); return;
      }
      res.json(ApiResponse.success({ user: { id: row.id, email: row.email, full_name: row.full_name, role } }));
    } catch { res.status(503).json(ApiResponse.error('Session service is unavailable.', 'AUTH_UNAVAILABLE')); }
  });
  router.post('/logout', (req, res) => {
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
