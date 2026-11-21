import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecoveryPage from './Recovery';
import { forgotPassword, resetPassword, takeResetToken } from '../services/recovery';
vi.mock('../services/recovery', () => ({ forgotPassword: vi.fn(), resetPassword: vi.fn(), takeResetToken: vi.fn(), clearResetToken: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(takeResetToken).mockReturnValue('ab'.repeat(32)); });
const renderPage = (reset = false) => render(<MemoryRouter><RecoveryPage reset={reset} theme="light" toggleTheme={() => {}}/></MemoryRouter>);
describe('password recovery pages', () => {
  it('submits through the shared service and displays the generic response', async () => {
    vi.mocked(forgotPassword).mockResolvedValue(); renderPage();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists');
    expect(forgotPassword).toHaveBeenCalledWith('member@example.test');
  });
  it('rejects a missing token', () => {
    vi.mocked(takeResetToken).mockReturnValue(''); renderPage(true);
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or missing');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
  it('checks confirmation before calling the backend and supports visibility', async () => {
    renderPage(true);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'A new test password!' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Different test password!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show passwords' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('matching passwords');
    expect(resetPassword).not.toHaveBeenCalled();
  });
  it('updates the password without automatically signing in', async () => {
    vi.mocked(resetPassword).mockResolvedValue(); renderPage(true);
    for (const label of ['New password', 'Confirm new password']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'A new test password!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Please sign in with your new password');
    expect(screen.getByRole('link', { name: 'Back to Login' })).toHaveAttribute('href', '/login');
  });
  it('shows safe errors for an expired link', async () => {
    vi.mocked(resetPassword).mockRejectedValue({ code: 'INVALID_RESET_TOKEN', message: 'private SQL' }); renderPage(true);
    for (const label of ['New password', 'Confirm new password']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'A new test password!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('invalid or expired'));
    expect(screen.queryByText('private SQL')).not.toBeInTheDocument();
  });
});
