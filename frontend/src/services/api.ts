import axios, { AxiosInstance } from 'axios';
import { ApiResponseEnvelope, HealthData } from '../types/api.types';
import { ApiError, httpError, normalizeApiError } from './apiError';
import { expireSession, sessionGeneration } from './session';

declare module 'axios' {
  interface AxiosRequestConfig { sessionGeneration?: number }
}

// API base URL configured from environment variable with fallback
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) || '';
const configuredTimeout=Number(import.meta.env.VITE_API_TIMEOUT_MS);
export const API_TIMEOUT_MS=Number.isFinite(configuredTimeout)&&configuredTimeout>0?configuredTimeout:10000;

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
  responseType: 'json',
  transitional: { silentJSONParsing: false },
});

apiClient.interceptors.request.use(config => {
  config.sessionGeneration=sessionGeneration();
  // Axios sets JSON for plain objects and the browser sets multipart boundaries.
  if (typeof FormData!=='undefined' && config.data instanceof FormData) config.headers.delete('Content-Type');
  return config;
});
function protectedRequest(url?:string): boolean {
  const path=new URL(url??'', 'http://api.local').pathname;
  return path.startsWith('/api/v1/') && !path.startsWith('/api/v1/auth/') && path!=='/api/v1/health';
}
apiClient.interceptors.response.use(response => {
  if (response.status===204 || response.config.method==='head') { response.data=undefined; return response; }
  const body=response.data;
  if (!body || typeof body!=='object' || typeof body.success!=='boolean' || body.success && !Object.hasOwn(body,'data')) {
    throw new ApiError('The service returned an invalid response. Please try again.','invalid_response',response.status,'INVALID_RESPONSE');
  }
  if (!body.success) throw httpError(response.status,body);
  return response;
}, error => {
  if (axios.isAxiosError(error) && error.response?.status===401 && protectedRequest(error.config?.url)) {
    expireSession(error.config?.sessionGeneration);
  }
  return Promise.reject(normalizeApiError(error));
});

/** Validate a successful envelope when a service requires a JSON payload. */
export function unwrapResponse<T>(body:unknown): T {
  if (!body || typeof body!=='object' || !('success' in body) || body.success!==true || !('data' in body)) {
    throw new ApiError('The service returned an invalid response. Please try again.','invalid_response',undefined,'INVALID_RESPONSE');
  }
  return (body as ApiResponseEnvelope<T>).data;
}

/**
 * Fetch backend health status
 */
export async function getHealthCheck(): Promise<HealthData> {
  const response = await apiClient.get<ApiResponseEnvelope<HealthData>>('/health');
  return unwrapResponse<HealthData>(response.data);
}
