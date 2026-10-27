import { Request, Response, NextFunction } from 'express';
import { AppError, ApiResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const errorCode = isAppError ? err.errorCode : 'INTERNAL_SERVER_ERROR';
  const message = isAppError ? err.message : 'An unexpected internal error occurred';
  const details = isAppError ? err.details : undefined;

  logger.error(`Error on ${req.method} ${req.originalUrl}: ${err.message}`, {
    statusCode,
    errorCode,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(statusCode).json(
    ApiResponse.error(
      message,
      errorCode,
      env.NODE_ENV === 'development' ? details ?? { stack: err.stack } : details
    )
  );
}
