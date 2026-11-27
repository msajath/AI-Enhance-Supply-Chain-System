import { apiClient } from './api';

// Capture once before React renders; fragments never reach HTTP servers or referrers.
let initialToken = '';
if (window.location.pathname === '/reset-password') {
  initialToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  window.history.replaceState(window.history.state, '', window.location.pathname);
}
export function takeResetToken() { return initialToken; }
export function clearResetToken() { initialToken = ''; }
export async function forgotPassword(email: string) { await apiClient.post('/api/v1/auth/forgot-password', { email }); }
export async function resetPassword(token: string, newPassword: string, confirmPassword: string) {
  await apiClient.post('/api/v1/auth/reset-password', { token, newPassword, confirmPassword });
}
