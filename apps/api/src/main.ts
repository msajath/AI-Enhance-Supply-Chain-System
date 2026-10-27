import { createApp } from './app';
import { env } from './config/env';
import { checkDatabaseConnection, closeDatabasePool } from './config/database';
import { logger } from './utils/logger';

async function bootstrap() {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`====================================================`);
    logger.info(`Qorvenz Tech Platform API Backend Started`);
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Server Port: ${env.PORT}`);
    logger.info(`Health Endpoint: http://localhost:${env.PORT}/health`);
    logger.info(`API v1 Base: http://localhost:${env.PORT}/api/v1`);
    logger.info(`====================================================`);
  });

  // Check initial database connectivity asynchronously
  checkDatabaseConnection().then((dbStatus) => {
    if (dbStatus.connected) {
      logger.info(`PostgreSQL database connected successfully (${dbStatus.latencyMs}ms)`);
    } else {
      logger.warn(`PostgreSQL is not yet reachable: ${dbStatus.error}. Check Docker / DB credentials.`);
    }
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      logger.info('HTTP server closed');
      await closeDatabasePool();
      process.exit(0);
    });

    // Force exit if not closed within 10s
    setTimeout(() => {
      logger.error('Forceful shutdown triggered after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Fatal error during application bootstrap', { error: err.message, stack: err.stack });
  process.exit(1);
});
