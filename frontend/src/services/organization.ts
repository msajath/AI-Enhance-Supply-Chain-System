import axios from 'axios';
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

/** Maps API failures to short, safe messages. Never shows server details. */
export function loadErrorMessage(error: unknown, what: string): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return `You don't have access to these ${what}.`;
    if (status === 400) return `That filter isn't valid. Please choose another ${what === 'sites' ? 'project' : 'option'}.`;
    if (!error.response) return 'Unable to connect. Check your connection and try again.';
  }
  return `We couldn't load ${what} right now. Please try again.`;
}

export const isCanceled = (error: unknown) => axios.isCancel(error) || (error as { name?: string })?.name === 'CanceledError';
