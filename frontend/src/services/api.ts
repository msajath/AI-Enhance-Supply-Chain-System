import axios, { AxiosInstance } from 'axios';
import { ApiResponseEnvelope, HealthData } from '../types/api.types';

// API base URL configured from environment variable with fallback
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) || '';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Fetch backend health status
 */
export async function getHealthCheck(): Promise<HealthData> {
  const response = await apiClient.get<ApiResponseEnvelope<HealthData>>('/health');
  return response.data.data;
}
