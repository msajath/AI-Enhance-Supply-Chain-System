import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import App from './App';
import { apiClient } from './services/api';
import { loginErrorMessage } from './services/auth';

const user = { id: 'u1', email: 'member@example.com', full_name: 'Test Member', role: 'Driver' };
const post = vi.spyOn(apiClient, 'post');
const get = vi.spyOn(apiClient, 'get');
async function renderLogin() { render(<App/>); await screen.findByRole('heading', { name: 'Sign in to your workspace' }); }
const failure = (status?: number, code?: string) => new AxiosError('private database details', code, undefined, undefined,
  status ? { status, data: { error: 'account exists' }, statusText: '', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } } : undefined);
beforeEach(() => { post.mockReset(); get.mockRejectedValue(failure(401)); localStorage.clear(); });
async function fill() {
  const keyboard = userEvent.setup();
  await keyboard.type(screen.getByLabelText('Work email'), 'member@example.com');
  await keyboard.type(screen.getByLabelText('Password'), 'entered-secret');
  return keyboard;
}
function submit() { fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!); }
describe('login', () => {
  it('renders branding and accessible fields without demo credentials or role assignment', async () => {
    await renderLogin();
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    expect(screen.getByLabelText('Work email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.queryByText('Use demo login')).not.toBeInTheDocument();
    expect(screen.queryByText('Good morning,')).not.toBeInTheDocument();
  });
  it('validates empty fields and focuses the email', async () => {
    await renderLogin(); submit();
    expect(screen.getByText('Email is required.')).toBeVisible();
    expect(screen.getByText('Password is required.')).toBeVisible();
    expect(screen.getByLabelText('Work email')).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
  });
  it('validates email before calling the API', async () => {
    await renderLogin(); await userEvent.type(screen.getByLabelText('Work email'), 'invalid'); submit();
    expect(screen.getByText('Enter a valid email address.')).toBeVisible(); expect(post).not.toHaveBeenCalled();
  });
  it('sends credentials and renders the existing dashboard with the server role and name', async () => {
    post.mockResolvedValue({ data: { success: true, data: { user } } });
    await renderLogin(); await fill(); submit();
    await screen.findByRole('heading', { name: /Good morning, Test/ });
    expect(post).toHaveBeenCalledWith('/api/v1/auth/login', { email: user.email, password: 'entered-secret' }, { withCredentials: true });
    expect(screen.queryByRole('button', { name: 'Team' })).not.toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
  });
  it.each([401, 403])('hides backend details for status %s', async status => {
    post.mockRejectedValue(failure(status)); await renderLogin(); await fill(); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByText(/account exists/)).not.toBeInTheDocument();
  });
  it('handles network failures', async () => {
    post.mockRejectedValue(failure()); await renderLogin(); await fill(); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect.');
  });
  it('blocks duplicate submissions while loading', async () => {
    let resolve!: (value: unknown) => void;
    post.mockImplementation(() => new Promise(r => { resolve = r; }));
    await renderLogin(); await fill(); submit();
    const button = screen.getByRole('button', { name: /Signing in/ });
    expect(button).toBeDisabled(); expect(screen.getByLabelText('Password')).toHaveValue('');
    fireEvent.submit(button.closest('form')!); expect(post).toHaveBeenCalledTimes(1);
    resolve({ data: {} }); await screen.findByRole('alert');
  });
  it('rejects malformed responses and unsupported roles', async () => {
    post.mockResolvedValue({ data: { success: true, data: { user: { ...user, role: 'SUPERUSER' } } } });
    await renderLogin(); await fill(); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in.');
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  });
  it('toggles password visibility and theme', async () => {
    await renderLogin(); await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(screen.getByRole('main')).toHaveClass('theme-dark');
  });
  it.each([400, 422, 429, 500, 404])('maps HTTP %s to a safe message', status => {
    expect(loginErrorMessage(failure(status))).not.toMatch(/private|database|exists/);
  });
  it('maps timeouts', () => { expect(loginErrorMessage(failure(undefined, 'ECONNABORTED'))).toMatch(/timed out/); });
});


describe('session lifecycle', () => {
  it('restores an authenticated user before rendering the dashboard', async () => {
    get.mockResolvedValue({ data: { success: true, data: { user } } });
    render(<App/>);
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your session');
    await screen.findByRole('heading', { name: /Good morning, Test/ });
    expect(get).toHaveBeenCalledWith('/api/v1/auth/session', { withCredentials: true });
  });
  it('reports restoration failures without displaying protected content', async () => {
    get.mockRejectedValue(failure(503));
    await renderLogin();
    expect(screen.getByRole('status')).toHaveTextContent('Unable to restore your session');
    expect(screen.queryByRole('heading', { name: /Good morning/ })).not.toBeInTheDocument();
  });
  it('invalidates the backend session before clearing authentication', async () => {
    get.mockResolvedValue({ data: { success: true, data: { user } } });
    post.mockResolvedValue({ data: { success: true } });
    render(<App/>);
    await screen.findByRole('heading', { name: /Good morning/ });
    await userEvent.click(screen.getByTitle('Sign out'));
    await screen.findByRole('heading', { name: 'Sign in to your workspace' });
    expect(post).toHaveBeenCalledWith('/api/v1/auth/logout', {}, { withCredentials: true });
  });
  it('keeps the session visible and reports failed logout', async () => {
    get.mockResolvedValue({ data: { success: true, data: { user } } });
    post.mockRejectedValue(failure(503));
    render(<App/>);
    await screen.findByRole('heading', { name: /Good morning/ });
    await userEvent.click(screen.getByTitle('Sign out'));
    expect(await screen.findByText('Unable to sign out. Please try again.')).toBeVisible();
    expect(screen.getByRole('heading', { name: /Good morning/ })).toBeVisible();
  });
});
