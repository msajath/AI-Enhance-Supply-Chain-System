import type session from 'express-session';
import { createManagementRouter } from './routes/management.routes';
import { createAuthRouter } from './routes/auth.routes';
import { createOrganizationRouter } from './routes/organization.routes';
import { createDefaultSessionStore, createSessionMiddleware } from './middleware/session';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { rootRouter } from './routes';
import { AppError } from './utils/apiResponse';

export function createApp(sessionStore?: session.Store): Express {
  const app = express();
  if (env.TRUST_PROXY_HOPS) app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // Security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: [env.CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Logging middleware
  app.use(requestLogger);

  // One session store shared by the auth router and the protected business routes.
  const store = sessionStore ?? createDefaultSessionStore();

  // Mount API and health routes
  app.use('/api/v1/auth', createAuthRouter(store));
  app.use('/api/v1', createManagementRouter(createSessionMiddleware(store)));
  app.use('/api/v1', createOrganizationRouter(createSessionMiddleware(store)));
  app.use(rootRouter);

  // 404 handler for undefined routes
  app.use('*', (req, _res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
  });

  // Centralized error handling middleware
  app.use(errorHandler);

  return app;
}
