import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { randomBytes } from 'crypto';
import type { RequestHandler } from 'express';
import { pool } from '../config/database';
import { env } from '../config/env';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    authVersion?: number;
  }
}

/**
 * One place for the session cookie settings, shared by the auth router and the
 * protected business routes (projects, sites, ...), so both read the same cookie.
 */
export const SESSION_COOKIE_NAME = 'qorvenz.sid';
export const sessionCookie = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
};

// Development-only fallback; generated once per process so all routers agree.
const devSecret = randomBytes(32).toString('hex');

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET || (env.NODE_ENV === 'production' ? '' : devSecret);
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return secret;
}

/** PostgreSQL-backed store; sessions survive API restarts. Tests inject a MemoryStore instead. */
export function createDefaultSessionStore(): session.Store {
  return new (connectPgSimple(session))({ pool, createTableIfMissing: true });
}

export function createSessionMiddleware(store: session.Store): RequestHandler {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: sessionSecret(),
    store,
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookie,
  });
}
