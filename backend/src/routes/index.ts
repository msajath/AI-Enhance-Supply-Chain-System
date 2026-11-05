import { Router } from 'express';
import { healthRouter } from './health.routes';
import { ApiResponse } from '../utils/apiResponse';

export const rootRouter = Router();

// Health check endpoint mounted at /health and /api/v1/health
rootRouter.use('/health', healthRouter);

// API v1 prefix
const apiV1Router = Router();
apiV1Router.use('/health', healthRouter);

apiV1Router.get('/', (_req, res) => {
  res.json(
    ApiResponse.success(
      {
        message: 'Welcome to Qorvenz Tech Platform API v1',
        modules: [
          'auth',
          'organization',
          'procurement',
          'inventory',
          'fleet',
          'logistics',
          'reporting',
          'ai',
        ],
      },
      'Qorvenz Tech API v1 active'
    )
  );
});

rootRouter.use('/api/v1', apiV1Router);
