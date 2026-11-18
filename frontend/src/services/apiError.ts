import axios from 'axios';

export type ApiErrorKind = 'http' | 'api' | 'timeout' | 'network' | 'canceled' | 'invalid_response';
export interface FieldError { field: string; message: string }
const messages: Record<number,string> = {
  400:'Check the entered details.', 401:'Your session has expired. Please sign in again.',
  403:'Access denied. You do not have permission for this resource.',
  404:'The requested resource was not found.', 409:'The change conflicts with existing data. Please review it.',
  422:'Check the entered details.', 429:'Too many requests. Please wait before trying again.',
};
export class ApiError extends Error {
  readonly name = 'ApiError';
  constructor(message:string, public readonly kind:ApiErrorKind, public readonly status?:number,
    public readonly code?:string, public readonly fieldErrors:readonly FieldError[] = []) { super(message); }
}

function fieldErrors(details:unknown, message:unknown, code?:string): FieldError[] {
  // Management routes encode Zod issues as "field: message; field: message".
  if (!Array.isArray(details) && code==='INVALID_INPUT' && typeof message==='string' && message.length<=2000) {
    details=message.split('; ').flatMap(part=>{
      const match=/^([\w.[\]-]+): (.+)$/.exec(part);
      return match?[{path:match[1].split('.'),message:match[2]}]:[];
    });
  }
  if (!Array.isArray(details)) return [];
  return details.slice(0,20).flatMap(issue => {
    if (!issue || !Array.isArray(issue.path) || typeof issue.message !== 'string') return [];
    const field=issue.path.filter((part:unknown)=>typeof part==='string'||typeof part==='number').join('.');
    if (!field || field.length>150 || !/^[\w.[\]-]+$/.test(field)) return [];
    const message=issue.message;
    // Only bounded, single-line validation messages are presented. Never raw details.
    const safe=message.length<=250 && !/[\r\n]|stack|password_hash|bearer\s|select\s.+from|SQLSTATE|postgres|JWT_SECRET/i.test(message);
    return [{field,message:safe?message:'This field is invalid.'}];
  });
}
export function httpError(status:number, body:unknown): ApiError {
  const error=body && typeof body==='object' && 'error' in body ? body.error : undefined;
  const data=error && typeof error==='object' ? error as Record<string,unknown> : {};
  const code=typeof data.code==='string' && /^[A-Z0-9_]{1,80}$/.test(data.code)?data.code:undefined;
  return new ApiError(messages[status] ?? (status>=500?'This service is temporarily unavailable. Please try again.':'The request could not be completed.'),
    status>=400?'http':'api',status,code,[400,422].includes(status)?fieldErrors(data.details,data.message,code):[]);
}
export function normalizeApiError(error:unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError('The request was canceled.','canceled',undefined,'CANCELED');
  if (axios.isAxiosError(error)) {
    if (error.code==='ECONNABORTED'||error.code==='ETIMEDOUT') return new ApiError('The request timed out. Please try again.','timeout',undefined,'TIMEOUT');
    if (error.code==='ERR_BAD_RESPONSE' && (!error.response || error.response.status<400)) return new ApiError('The service returned an invalid response. Please try again.','invalid_response',error.response?.status,'INVALID_RESPONSE');
    if (error.response) return httpError(error.response.status,error.response.data);
    return new ApiError('Unable to connect. Check your connection and try again.','network',undefined,'NETWORK_ERROR');
  }
  return new ApiError('The request could not be completed. Please try again.','invalid_response',undefined,'INVALID_RESPONSE');
}
