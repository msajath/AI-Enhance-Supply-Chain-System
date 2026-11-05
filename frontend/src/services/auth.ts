import axios from 'axios';
import { apiClient } from './api';

// Authentication uses an HttpOnly session cookie; no token is exposed to React.
export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'Admin' | 'Warehouse manager' | 'Driver';
}

export async function login(credentials: { email: string; password: string }): Promise<AuthUser> {
  const response = await apiClient.post('/api/v1/auth/login', credentials, { withCredentials: true });
  return parseUser(response.data);
}

export async function signup(credentials: { fullName: string; email: string; password: string }): Promise<AuthUser> {
  const response = await apiClient.post('/api/v1/auth/signup', credentials, { withCredentials: true });
  return parseUser(response.data);
}

function parseUser(data: unknown): AuthUser {
  const response = { data: data as { success?: boolean; data?: { user?: AuthUser } } };
  const user = response.data?.data?.user;
  if (response.data?.success !== true || !user || typeof user.id !== 'string' || !user.id ||
      typeof user.email !== 'string' || typeof user.full_name !== 'string' || !user.full_name.trim() ||
      !['Admin', 'Warehouse manager', 'Driver'].includes(user.role)) {
    throw new Error('INVALID_AUTH_RESPONSE');
  }
  return { id: user.id, email: user.email, full_name: user.full_name, role: user.role };
}

export function loginErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Unable to sign in. Please try again later.';
  const status = error.response?.status;
  if (status === 401 || status === 403) return 'Email or password is incorrect.';
  if (status === 400 || status === 422) return 'Check your email and password and try again.';
  if (status === 429) return 'Too many sign-in attempts. Please wait before trying again.';
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'Sign-in timed out. Please try again.';
  if (!error.response) return 'Unable to connect. Check your connection and try again.';
  return 'Sign-in service is unavailable. Please try again later.';
}

export function signupErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Unable to create your account. Please try again later.';
  const status = error.response?.status;
  if (status === 409) return 'An account with this email already exists.';
  if (status === 400 || status === 422) return 'Check your name, email, and password and try again.';
  if (status === 429) return 'Too many sign-up attempts. Please wait before trying again.';
  if (!error.response) return 'Unable to connect. Check your connection and try again.';
  return 'Sign-up service is unavailable. Please try again later.';
}

export async function restoreSession(): Promise<AuthUser | null> {
  try {
    const response = await apiClient.get('/api/v1/auth/session', { withCredentials: true });
    return parseUser(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) return null;
    throw error;
  }
}
export async function logout(): Promise<void> {
  await apiClient.post('/api/v1/auth/logout', {}, { withCredentials: true });
}
