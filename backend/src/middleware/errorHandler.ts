import { Request, Response, NextFunction } from 'express';
import { AppError, ApiResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const type = (err as Error & { type?: string }).type;
  if (type === 'entity.parse.failed') {
    res
      .status(400)
      .json(
        ApiResponse.error('Enter valid request data.', 'INVALID_INPUT', [
          { field: 'body', message: 'Expected valid JSON.' },
        ])
      );
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json(ApiResponse.error('Request body is too large.', 'PAYLOAD_TOO_LARGE'));
    return;
  }
  if (err instanceof AppError && err.statusCode < 500) {
    res.status(err.statusCode).json(ApiResponse.error(err.message, err.errorCode, err.details));
    return;
  }
  logger.error('Unhandled API error', { method: req.method });
  if (req.path.startsWith('/api/v1/auth/')) {
    res
      .status(503)
      .json(ApiResponse.error('Authentication service is unavailable.', 'AUTH_UNAVAILABLE'));
    return;
  }
  res
    .status(500)
    .json(ApiResponse.error('An unexpected internal error occurred', 'INTERNAL_SERVER_ERROR'));
}
