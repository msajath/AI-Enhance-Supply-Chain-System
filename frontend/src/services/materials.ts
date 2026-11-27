import { apiClient } from './api';
import { ApiError } from './apiError';
import axios from 'axios';

export interface Material {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  reorder_level: number;
  organization_id?: string;
  created_at?: string;
}

export interface RegisterMaterialInput {
  code: string;
  name: string;
  unit: string;
  category: string;
  reorder_level: number;
}

export async function fetchMaterials(signal?: AbortSignal, procurement = false): Promise<Material[]> {
  const response = await apiClient.get<{ success: boolean; data: { rows: Material[] } }>(procurement?'/api/v1/procurement/materials':'/api/v1/warehouse/materials', {
    withCredentials: true,
    signal,
  });
  return response.data.data.rows;
}

export async function registerMaterial(data: RegisterMaterialInput): Promise<Material> {
  const response = await apiClient.post<{ success: boolean; data: { row: Material } }>('/api/v1/warehouse/materials', data, {
    withCredentials: true,
  });
  return response.data.data.row;
}

export function materialErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return 'Session expired. Please sign in again.';
    if (status === 403) return 'You do not have access to view or manage materials.';
    if (!error.response) return 'Unable to connect to materials service. Please check your network connection.';
    const data = error.response.data as { message?: string; error?: string } | undefined;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
  }
  if (error instanceof Error) return error.message;
  return 'Failed to load materials catalog. Please try again.';
}
