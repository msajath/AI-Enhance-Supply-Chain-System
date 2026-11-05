import { Router } from 'express';
import type session from 'express-session';
import { compare, hashSync } from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { pool } from '../config/database';
import { createDefaultSessionStore, createSessionMiddleware, SESSION_COOKIE_NAME as cookieName, sessionCookie as cookie } from '../middleware/session';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';

const dummyHash = hashSync(randomBytes(32).toString('hex'), 12);
const roleNames: Record<string, string> = { ADMIN: 'Admin', WAREHOUSE_MANAGER: 'Warehouse manager', DRIVER: 'Driver' };
const credentialsSchema = z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72) }).strict();
const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
}).strict();
const jwtSignOptions: SignOptions = {
  algorithm: 'HS256',
  expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
};

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
  const result = await pool.query('SELECT id, email, full_name, role, is_active FROM users WHERE id = $1 LIMIT 1', [decoded.sub]);
  const row = result.rows[0];
  return row?.is_active && roleNames[row.role] ? row : undefined;
}

export function createAuthRouter(store?: session.Store) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // PostgreSQL sessions survive API restarts; tests may inject an isolated store.
  router.use(createSessionMiddleware(store ?? createDefaultSessionStore()));
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
      const accessToken = jwt.sign({ sub: row.id }, env.JWT_SECRET, jwtSignOptions);
      const tokenPayload = jwt.decode(accessToken) as JwtPayload;
      res.json(ApiResponse.success({
        accessToken,
        tokenType: 'Bearer',
        expiresIn: (tokenPayload.exp ?? 0) - (tokenPayload.iat ?? 0),
        user: publicUser(row),
      }, 'Login successful'));
    } catch { res.status(503).json(ApiResponse.error('Sign-in service is unavailable. Please try again later.', 'AUTH_UNAVAILABLE')); }
  });
  router.post('/signup', rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: ApiResponse.error('Too many sign-up attempts. Please try again later.', 'RATE_LIMITED') }), async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json(ApiResponse.error('Enter a name, valid email, and password with at least 8 characters.', 'INVALID_INPUT')); return; }
    try {
      const passwordHash = await hashSync(parsed.data.password, 12);
      const result = await pool.query(
        'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, role, is_active',
        [parsed.data.email.toLowerCase(), passwordHash, parsed.data.fullName, 'DRIVER']
      );
      const row = result.rows[0];
      await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.userId = row.id;
      await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      const accessToken = jwt.sign({ sub: row.id }, env.JWT_SECRET, jwtSignOptions);
      const tokenPayload = jwt.decode(accessToken) as JwtPayload;
      res.status(201).json(ApiResponse.success({
        accessToken,
        tokenType: 'Bearer',
        expiresIn: (tokenPayload.exp ?? 0) - (tokenPayload.iat ?? 0),
        user: publicUser(row),
      }, 'Account created'));
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        res.status(409).json(ApiResponse.error('An account with this email already exists.', 'EMAIL_ALREADY_REGISTERED'));
        return;
      }
      res.status(503).json(ApiResponse.error('Sign-up service is unavailable. Please try again later.', 'AUTH_UNAVAILABLE'));
    }
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
      res.json(ApiResponse.success({ user: publicUser(row) }));
    } catch { res.status(503).json(ApiResponse.error('Session service is unavailable.', 'AUTH_UNAVAILABLE')); }
  });
  router.get('/me', async (req, res) => {
    try {
      const row = await authenticatedUser(req);
      if (!row) {
        res.status(401).json(ApiResponse.error('Authentication required.', 'UNAUTHENTICATED'));
        return;
      }
      res.json(ApiResponse.success({ user: publicUser(row) }));
    } catch {
      res.status(401).json(ApiResponse.error('Authentication required.', 'UNAUTHENTICATED'));
    }
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
