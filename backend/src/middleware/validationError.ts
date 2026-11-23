import type { ZodError } from 'zod';
import { ApiResponse } from '../utils/apiResponse';

export function invalidFields(error: ZodError, message = 'Input validation failed') {
  const fields = error.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : 'body',
    message: issue.message,
  }));
  return ApiResponse.error(message, 'INVALID_INPUT', fields);
}
