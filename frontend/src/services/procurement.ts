import { apiClient } from './api';
import { ApiError } from './apiError';
import axios from 'axios';

/**
 * Procurement & Supplier service (Jira AESCS-52).
 * Conforms to approved ERD entities:
 *   COMPANY -> SUPPLIER
 *   SUPPLIER -> SUPPLIER_MATERIAL
 */

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  organization_id?: string;
  created_at?: string;
}

export interface PricingHistoryRecord {
  id: string;
  supplier_id: string;
  material_id: string;
  material_code: string;
  material_name: string;
  unit: string;
  unit_price: number;
  effective_date: string;
  expiry_date?: string | null;
  note?: string | null;
}

export async function fetchSuppliers(signal?: AbortSignal): Promise<Supplier[]> {
  const response = await apiClient.get<{ success: boolean; data: { rows: Supplier[] } }>('/api/v1/procurement/suppliers', {
    withCredentials: true,
    signal,
  });
  return response.data.data.rows;
}

export async function fetchPricingHistory(
  supplierId: string,
  startDate?: string,
  endDate?: string,
  signal?: AbortSignal
): Promise<PricingHistoryRecord[]> {
  const response = await apiClient.get<{ success: boolean; data: { rows: PricingHistoryRecord[] } }>(
    `/api/v1/procurement/suppliers/${supplierId}/pricing-history`,
    {
      withCredentials: true,
      signal,
      params: {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      },
    }
  );
  return response.data.data.rows;
}

export function procurementErrorMessage(error: unknown, what = 'procurement records'): string {
  if (error instanceof ApiError) return error.message;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return 'Session expired. Please sign in again.';
    if (status === 403) return `You do not have permission to view ${what}. Access is restricted.`;
    if (status === 404) return 'The requested supplier or pricing records were not found.';
    if (!error.response) return 'Network failure. Unable to reach the procurement service.';
    const data = error.response.data as { message?: string; error?: string } | undefined;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
  }
  if (error instanceof Error) return error.message;
  return `Failed to load ${what}. Please try again later.`;
}
