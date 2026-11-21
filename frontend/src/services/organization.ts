import axios from 'axios';
import { ApiError } from './apiError';
import { apiClient } from './api';

// Read-only project & site API (Jira AESCS-42). Scope is decided by the server.
export interface Project {
  id: string;
  code: string;
  name: string;
  status: 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED' | string;
  startDate: string | null;
  endDate: string | null;
  siteCount: number;
}

export interface Site {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  code: string;
  name: string;
  address: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | string;
}

export interface Scope {
  companyWide: boolean;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

function unwrap<T>(body: Envelope<T>, key: keyof T): T {
  if (body?.success !== true || !body.data || !Array.isArray(body.data[key])) throw new Error('INVALID_RESPONSE');
  return body.data;
}

export async function fetchProjects(signal?: AbortSignal): Promise<{ projects: Project[]; scope: Scope }> {
  const response = await apiClient.get<Envelope<{ projects: Project[]; scope: Scope }>>('/api/v1/projects', { withCredentials: true, signal });
  return unwrap(response.data, 'projects');
}

export async function fetchSites(projectId?: string, signal?: AbortSignal): Promise<{ sites: Site[]; scope: Scope }> {
  const response = await apiClient.get<Envelope<{ sites: Site[]; scope: Scope }>>('/api/v1/sites', {
    withCredentials: true,
    signal,
    params: projectId ? { projectId } : undefined,
  });
  return unwrap(response.data, 'sites');
}

export interface CreateProjectInput {
  code: string;
  name: string;
  status: 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  start_date?: string | null;
  end_date?: string | null;
}

export interface CreateSiteInput {
  project_id: string;
  code: string;
  name: string;
  address?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
}

export function normalizeProject(raw: Record<string, unknown>): Project {
  return {
    id: String(raw.id ?? ''),
    code: String(raw.code ?? ''),
    name: String(raw.name ?? ''),
    status: String(raw.status ?? 'ACTIVE'),
    startDate: (raw.startDate ?? raw.start_date ?? null) as string | null,
    endDate: (raw.endDate ?? raw.end_date ?? null) as string | null,
    siteCount: typeof raw.siteCount === 'number' ? raw.siteCount : typeof raw.site_count === 'number' ? Number(raw.site_count) : 0,
  };
}

export function normalizeSite(raw: Record<string, unknown>): Site {
  return {
    id: String(raw.id ?? ''),
    projectId: String(raw.projectId ?? raw.project_id ?? ''),
    projectCode: String(raw.projectCode ?? raw.project_code ?? ''),
    projectName: String(raw.projectName ?? raw.project_name ?? ''),
    code: String(raw.code ?? ''),
    name: String(raw.name ?? ''),
    address: (raw.address ?? null) as string | null,
    status: String(raw.status ?? 'ACTIVE'),
  };
}

export async function createProject(data: CreateProjectInput): Promise<Project> {
  const response = await apiClient.post<{ success: boolean; data: { row: Record<string, unknown> } }>('/api/v1/admin/projects', data, { withCredentials: true });
  return normalizeProject(response.data.data.row);
}

export async function updateProject(id: string, data: Partial<CreateProjectInput>): Promise<Project> {
  const response = await apiClient.patch<{ success: boolean; data: { row: Record<string, unknown> } }>(`/api/v1/admin/projects/${id}`, data, { withCredentials: true });
  return normalizeProject(response.data.data.row);
}

export async function createSite(data: CreateSiteInput): Promise<Site> {
  const response = await apiClient.post<{ success: boolean; data: { row: Record<string, unknown> } }>('/api/v1/admin/sites', data, { withCredentials: true });
  return normalizeSite(response.data.data.row);
}

export async function updateSite(id: string, data: Partial<CreateSiteInput>): Promise<Site> {
  const response = await apiClient.patch<{ success: boolean; data: { row: Record<string, unknown> } }>(`/api/v1/admin/sites/${id}`, data, { withCredentials: true });
  return normalizeSite(response.data.data.row);
}

/** Maps API failures to short, safe messages. Never shows server details. */
export function loadErrorMessage(error: unknown, what: string): string {
  if (error instanceof ApiError) return error.message;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return `You don't have access to these ${what}.`;
    if (status === 400) return `That filter isn't valid. Please choose another ${what === 'sites' ? 'project' : 'option'}.`;
    if (!error.response) return 'Unable to connect. Check your connection and try again.';
  }
  return `We couldn't load ${what} right now. Please try again.`;
}

export const isCanceled = (error: unknown) => (error instanceof ApiError && error.kind==='canceled') || axios.isCancel(error) || (error as { name?: string })?.name === 'CanceledError';
