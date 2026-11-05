import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const logLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevelPriority = logLevels[env.LOG_LEVEL as LogLevel] ?? 1;

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [QORVENZ-API]: ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: unknown) {
    if (logLevels.debug >= currentLevelPriority) {
      console.debug(formatMessage('debug', message, meta));
    }
  },
  info(message: string, meta?: unknown) {
    if (logLevels.info >= currentLevelPriority) {
      console.log(formatMessage('info', message, meta));
    }
  },
  warn(message: string, meta?: unknown) {
    if (logLevels.warn >= currentLevelPriority) {
      console.warn(formatMessage('warn', message, meta));
    }
  },
  error(message: string, meta?: unknown) {
    if (logLevels.error >= currentLevelPriority) {
      console.error(formatMessage('error', message, meta));
    }
  },
};
