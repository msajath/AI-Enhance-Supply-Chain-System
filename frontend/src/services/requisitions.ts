import { apiClient } from './api';
import { ApiError } from './apiError';
import axios from 'axios';

/**
 * Purchase Requisition & Approval service (Jira AESCS-56).
 * Conforms to approved ERD entities:
 *   PROJECT -> PURCHASE_REQUISITION
 *   PURCHASE_REQUISITION -> REQUISITION_ITEM
 *   APPROVAL_POLICY -> APPROVAL_REQUEST
 *   APPROVAL_REQUEST -> APPROVAL_ACTION
 */

export interface RequisitionItem {
  id?: string;
  material_id: string;
  material_code: string;
  material_name: string;
  unit: string;
  quantity: number;
}

export interface PurchaseRequisition {
  id: string;
  code: string;
  project_id: string;
  project_name: string;
  requester_id: string;
  requester_name: string;
  required_by_date: string;
  notes?: string | null;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
  items: RequisitionItem[];
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  requisition_id: string;
  requisition_code: string;
  project_name: string;
  requester_name: string;
  approver_id: string;
  approver_role: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  total_items: number;
  items: RequisitionItem[];
  required_by_date: string;
  created_at: string;
}

export interface CreateRequisitionInput {
  project_id: string;
  site_id: string;
  required_by_date: string;
  notes?: string | null;
  items: Array<{ material_id: string; quantity: number; estimated_unit_price: number }>;
}

export async function fetchRequisitions(signal?: AbortSignal): Promise<PurchaseRequisition[]> {
  const response = await apiClient.get<{ success: boolean; data: { rows: PurchaseRequisition[] } }>(
    '/api/v1/procurement/requisitions?view=workspace',
    { withCredentials: true, signal }
  );
  return response.data.data.rows;
}

export async function createRequisition(data: CreateRequisitionInput): Promise<PurchaseRequisition> {
  const response = await apiClient.post<{ success: boolean; data: { row: PurchaseRequisition } }>(
    '/api/v1/procurement/requisitions',
    data,
    { withCredentials: true }
  );
  return response.data.data.row;
}

export async function fetchApprovalQueue(signal?: AbortSignal): Promise<ApprovalRequest[]> {
  const response = await apiClient.get<{ success: boolean; data: { rows: ApprovalRequest[] } }>(
    '/api/v1/procurement/approvals/queue',
    { withCredentials: true, signal }
  );
  return response.data.data.rows;
}

export async function approveRequisition(requestId: string, comments?: string): Promise<void> {
  await apiClient.post(
    `/api/v1/procurement/approvals/${requestId}/approve`,
    { comments: comments || null },
    { withCredentials: true }
  );
}

export async function rejectRequisition(requestId: string, comments: string): Promise<void> {
  await apiClient.post(
    `/api/v1/procurement/approvals/${requestId}/reject`,
    { comments },
    { withCredentials: true }
  );
}

export function requisitionErrorMessage(error: unknown, what = 'requisition'): string {
  if (error instanceof ApiError) return error.message;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return 'Session expired. Please sign in again.';
    if (status === 403) return `You do not have permission to access this ${what}.`;
    if (status === 404) return `The requested ${what} was not found.`;
    if (!error.response) return 'Network failure. Unable to reach the procurement & approvals service.';
    const data = error.response.data as { message?: string; error?: string } | undefined;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
  }
  if (error instanceof Error) return error.message;
  return `Failed to process ${what}. Please try again later.`;
}
