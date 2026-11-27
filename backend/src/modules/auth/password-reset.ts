import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { pool } from '../../config/database';
import { ApiResponse } from '../../utils/apiResponse';
import { logger } from '../../utils/logger';
import { isRole } from '../../auth/permissions';

export const recoveryMessage = 'If an account exists with this email address, password reset instructions will be sent.';
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');
export const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  newPassword: z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72),
  confirmPassword: z.string(),
}).strict().refine(v => v.newPassword === v.confirmPassword);

export function recoveryConfig() {
  const origin = new URL(process.env.PASSWORD_RESET_ORIGIN || 'http://localhost:5173');
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      !['http:', 'https:'].includes(origin.protocol) ||
      (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw new Error('Invalid recovery origin');
  const minutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 20);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 30) throw new Error('Invalid recovery lifetime');
  return { origin: origin.origin, minutes };
}

export function recoveryEmail(url: string, minutes: number) {
  const text = `Hello,\n\nWe received a request to reset your Qorvenz Tech password.\nUse this secure link to create a new password:\n${url}\n\nThis link expires in ${minutes} minutes.\nIf you did not request this change, ignore this email. If you suspect unauthorized activity, contact your system administrator.\n\nQorvenz Tech Support`;
  return { subject: 'Reset Your Qorvenz Tech Password', text, html: `<p>Hello,</p><p>We received a request to reset your Qorvenz Tech password.</p><p><a href="${url}">Reset Password</a></p><p>This link expires in ${minutes} minutes.</p><p>If you did not request this change, ignore this email. If you suspect unauthorized activity, contact your system administrator.</p><p>Qorvenz Tech Support</p>` };
}

export async function sendRecovery(to: string, token: string) {
  const { origin, minutes } = recoveryConfig();
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new Error('Email not configured');
  const secure = process.env.SMTP_SECURE === 'true';
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure,
    requireTLS: process.env.NODE_ENV === 'production' && !secure,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    logger: false, debug: false,
  });
  try { await transport.sendMail({ from: process.env.SMTP_FROM, to, ...recoveryEmail(`${origin}/reset-password#token=${token}`, minutes) }); }
  finally { transport.close(); }
}

// All operations lock the user first, serializing issuance and consumption across API instances.
export async function issueRecovery(email: string, send = sendRecovery) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('SELECT id, email, is_active, role FROM users WHERE lower(email)=lower($1) LIMIT 1 FOR UPDATE', [email])).rows[0];
    if (user?.is_active && isRole(user.role)) {
      const recent = await client.query("SELECT 1 FROM password_reset_tokens WHERE user_id=$1 AND created_at > clock_timestamp() - interval '5 minutes' LIMIT 1", [user.id]);
      if (!recent.rowCount) {
        const token = randomBytes(32).toString('hex');
        const { minutes } = recoveryConfig();
        await client.query('UPDATE password_reset_tokens SET consumed_at=clock_timestamp() WHERE user_id=$1 AND consumed_at IS NULL', [user.id]);
        await client.query("INSERT INTO password_reset_tokens (user_id, token_digest, expires_at) VALUES ($1,$2,clock_timestamp()+$3 * interval '1 minute')", [user.id, tokenDigest(token), minutes]);
        // Bounded SMTP timeouts. Roll back issuance on delivery failure; previous links survive.
        await send(user.email, token);
      }
    }
    await client.query('COMMIT');
  } catch { await client.query('ROLLBACK'); throw new Error('Recovery unavailable'); }
  finally { client.release(); }
}

export async function consumeRecovery(token: string, password: string): Promise<boolean> {
  const digest = tokenDigest(token);
  const passwordHash = await hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('SELECT u.id, u.is_active, u.role FROM users u JOIN password_reset_tokens t ON t.user_id=u.id WHERE t.token_digest=$1 FOR UPDATE OF u', [digest])).rows[0];
    if (!user?.is_active || !isRole(user.role)) { await client.query('ROLLBACK'); return false; }
    const consumed = await client.query('UPDATE password_reset_tokens SET consumed_at=clock_timestamp() WHERE token_digest=$1 AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING user_id', [digest]);
    if (!consumed.rowCount) { await client.query('ROLLBACK'); return false; }
    await client.query('UPDATE users SET password_hash=$1, auth_version=auth_version+1 WHERE id=$2', [passwordHash, user.id]);
    await client.query('UPDATE password_reset_tokens SET consumed_at=clock_timestamp() WHERE user_id=$1 AND consumed_at IS NULL', [user.id]);
    await client.query("INSERT INTO system_audit_logs (actor_id,event_type,module,metadata) VALUES ($1,'PASSWORD_RESET','auth','{}')", [user.id]);
    await client.query('COMMIT');
    return true;
  } catch { await client.query('ROLLBACK'); throw new Error('Recovery unavailable'); }
  finally { client.release(); }
}

export function createPasswordResetRouter() {
  const router = Router();
  router.use(['/forgot-password', '/reset-password'], rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: ApiResponse.error('Too many recovery attempts. Please try again later.', 'RATE_LIMITED') }));
  router.post('/forgot-password', async (req, res) => {
    const parsed = z.object({ email: z.string().trim().email().max(255) }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json(ApiResponse.error('Enter a valid email address.', 'INVALID_INPUT')); return; }
    if (process.env.PASSWORD_RESET_ENABLED !== 'true') { res.status(503).json(ApiResponse.error('Password recovery is unavailable. Contact your administrator.', 'AUTH_UNAVAILABLE')); return; }
    // Acknowledge before lookup/delivery, keeping account existence and SMTP latency private.
    res.status(202).json(ApiResponse.success(null, recoveryMessage));
    void issueRecovery(parsed.data.email).catch(() => logger.warn('Password recovery request failed'));
  });
  router.post('/reset-password', async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json(ApiResponse.error('Check the reset link and matching passwords (12 characters minimum, 72 UTF-8 bytes maximum).', 'INVALID_INPUT')); return; }
    if (process.env.PASSWORD_RESET_ENABLED !== 'true') { res.status(503).json(ApiResponse.error('Password recovery is unavailable.', 'AUTH_UNAVAILABLE')); return; }
    try {
      const valid = await consumeRecovery(parsed.data.token, parsed.data.newPassword);
      if (!valid) { res.status(400).json(ApiResponse.error('This reset link is invalid or expired. Request a new link.', 'INVALID_RESET_TOKEN')); return; }
      res.json(ApiResponse.success(null, 'Your password has been updated successfully. Please sign in with your new password.'));
    } catch { logger.warn('Password reset failed'); res.status(503).json(ApiResponse.error('Password recovery is unavailable. Please try again later.', 'AUTH_UNAVAILABLE')); }
  });
  return router;
}
