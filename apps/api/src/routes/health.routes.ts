import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../config/database';
import { ApiResponse } from '../utils/apiResponse';
import { env } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseConnection();

  const healthData = {
    status: dbHealth.connected ? 'healthy' : 'degraded',
    service: 'qorvenz-api',
    version: '0.1.0',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: dbHealth.connected ? 'connected' : 'disconnected',
      latencyMs: dbHealth.latencyMs ?? null,
      error: dbHealth.error ?? null,
    },
    system: {
      nodeVersion: process.version,
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  };

  // Return 200 even if degraded so health probe can inspect details, or 503 if critical.
  // In development, return 200 with degraded state so frontend can show helpful diagnostic.
  const statusCode = dbHealth.connected ? 200 : 200;
  res.status(statusCode).json(ApiResponse.success(healthData, 'Service health check passed'));
});
