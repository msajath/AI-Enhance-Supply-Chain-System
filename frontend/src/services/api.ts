import axios, { AxiosInstance } from 'axios';
import { ApiResponseEnvelope, HealthData } from '../types/api.types';

// API base URL configured from environment variable with fallback
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Inject auth token when available in later sprints
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Client Error:', error?.response?.data || error.message);
    return Promise.reject(error);
  }
);

/**
 * Fetch backend health status
 */
export async function getHealthCheck(): Promise<HealthData> {
  const response = await apiClient.get<ApiResponseEnvelope<HealthData>>('/health');
  return response.data.data;
}
