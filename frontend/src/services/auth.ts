import axios from 'axios';
import {roleCatalog} from './roles';
import { apiClient } from './api';
import { ApiError } from './apiError';
import { startSession, endSession } from './session';

// Authentication uses an HttpOnly session cookie; no token is exposed to React.
export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: (typeof roleCatalog)[number]['label'];
  roleCode?: string;
  roles?: string[];
  permissions?: string[];
  dashboard?: string;
}

export async function login(credentials: { email: string; password: string }): Promise<AuthUser> {
  const response = await apiClient.post('/api/v1/auth/login', credentials, { withCredentials: true });
  const user=parseUser(response.data);
  startSession();
  return user;
}

function parseUser(data: unknown): AuthUser {
  const response = { data: data as { success?: boolean; data?: { user?: AuthUser } } };
  const user = response.data?.data?.user;
  if (response.data?.success !== true || !user || typeof user.id !== 'string' || !user.id ||
      typeof user.email !== 'string' || typeof user.full_name !== 'string' || !user.full_name.trim() ||
      !roleCatalog.some(role => role.label === user.role)) {
    throw new Error('INVALID_AUTH_RESPONSE');
  }
  return { id: user.id, email: user.email, full_name: user.full_name, role: user.role, roleCode: user.roleCode, roles: user.roles, permissions: user.permissions, dashboard: user.dashboard };
}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status===401||error.status===403) return 'Email or password is incorrect.';
    if (error.status===400||error.status===422) return 'Check your email and password and try again.';
    if (error.status===429) return 'Too many sign-in attempts. Please wait before trying again.';
    if (error.kind==='timeout') return 'Sign-in timed out. Please try again.';
    return error.message;
  }
  if (!axios.isAxiosError(error)) return 'Unable to sign in. Please try again later.';
  const status = error.response?.status;
  if (status === 401 || status === 403) return 'Email or password is incorrect.';
  if (status === 400 || status === 422) return 'Check your email and password and try again.';
  if (status === 429) return 'Too many sign-in attempts. Please wait before trying again.';
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'Sign-in timed out. Please try again.';
  if (!error.response) return 'Unable to connect. Check your connection and try again.';
  return 'Sign-in service is unavailable. Please try again later.';
}

export type RequestedRole = 'WAREHOUSE_MANAGER' | 'FLEET_MANAGER' | 'DRIVER';

/** Sends a request for a new account. An administrator must approve it before anyone can sign in. */
export async function requestAccess(request: { fullName: string; email: string; organizationCode: string; requestedRole: RequestedRole; password: string }): Promise<void> {
  await apiClient.post('/api/v1/auth/access-requests', request, { withCredentials: true });
}

export function requestErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError) && !axios.isAxiosError(error)) return 'Unable to send your request. Please try again later.';
  const status = error instanceof ApiError ? error.status : error.response?.status;
  const code = error instanceof ApiError ? undefined : (error.response?.data as { error?: { code?: string }; code?: string } | undefined);
  const errorCode = error instanceof ApiError ? error.code : code?.error?.code ?? code?.code;
  if (errorCode === 'COMPANY_NOT_FOUND') return 'We could not find that company code. Check it with your administrator.';
  if (errorCode === 'ACCOUNT_EXISTS') return 'An account with this email already exists. Sign in instead, or ask your administrator to reset the password.';
  if (errorCode === 'REQUEST_PENDING') return 'You already have a request waiting for approval. Your administrator will review it.';
  if (status === 400 || status === 422) return 'Check your details. The password needs at least 12 characters.';
  if (status === 429) return 'Too many requests. Please wait before trying again.';
  if (error instanceof ApiError) return error.message;
  if (!error.response) return 'Unable to connect. Check your connection and try again.';
  return 'The request service is unavailable. Please try again later.';
}

export async function restoreSession(): Promise<AuthUser | null> {
  try {
    const response = await apiClient.get('/api/v1/auth/me', { withCredentials: true });
    return parseUser(response.data);
  } catch (error) {
    if (error instanceof ApiError && error.status===401 || axios.isAxiosError(error) && error.response?.status === 401) return null;
    throw error;
  }
}
export async function logout(): Promise<void> {
  try { await apiClient.post('/api/v1/auth/logout', {}, { withCredentials: true }); }
  catch(error) { if (!(error instanceof ApiError && error.status===401)) throw error; }
  endSession();
}
