import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from root project directory or current working directory
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config(); // fallback

const envSchema = z.object({
  PORT: z.string().default('4000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5434').transform((val) => parseInt(val, 10)),
  DB_USER: z.string().default('qorvenz_user'),
  DB_PASSWORD: z.string().default('qorvenz_dev_secret_2026'),
  DB_NAME: z.string().default('qorvenz_db'),
  DB_SSL: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  JWT_SECRET: z.string().default('qorvenz_super_secret_jwt_key_sprint1_minimum_32_characters_long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables detected:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
