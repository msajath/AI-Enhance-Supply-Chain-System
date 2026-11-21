import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from './Login';
import { forgotPassword, resetPassword, takeResetToken, clearResetToken } from '../services/recovery';

export default function RecoveryPage({ reset = false, theme, toggleTheme }: { reset?: boolean; theme: 'light' | 'dark'; toggleTheme: () => void }) {
  const [token, setToken] = useState(takeResetToken);
  useEffect(() => { clearResetToken(); }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const invalid = reset && !/^[a-f0-9]{64}$/.test(token);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (reset && (password.length < 12 || new TextEncoder().encode(password).length > 72 || password !== confirm)) {
      setError('Use matching passwords with at least 12 characters and no more than 72 UTF-8 bytes.'); return;
    }
    submitting.current = true; setBusy(true);
    try {
      if (reset) await resetPassword(token, password, confirm); else await forgotPassword(email.trim());
      setDone(true); setToken('');
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === 'INVALID_RESET_TOKEN' ? 'This reset link is invalid or expired. Request a new link.' : 'The request could not be completed. Please try again later.');
    } finally { submitting.current = false; setBusy(false); setPassword(''); setConfirm(''); }
  };
  return <AuthLayout theme={theme} toggleTheme={toggleTheme}>
    <h1 className="auth-title">{done ? reset ? 'Password updated' : 'Check your email' : reset ? 'Reset your password' : 'Forgot your password?'}</h1>
    {done ? <p className="auth-lead" role="status">{reset ? 'Your password has been updated successfully. Please sign in with your new password.' : 'If an account exists with this email address, password reset instructions will be sent.'}</p>
      : invalid ? <p className="form-error" role="alert">This reset link is invalid or missing. <Link to="/forgot-password">Request a new link</Link>.</p>
      : <form className="auth-form" onSubmit={submit} aria-busy={busy}>
        {reset ? <>
          <p id="password-rules" className="auth-lead">Use at least 12 characters, up to 72 UTF-8 bytes.</p>
          <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={72} aria-describedby="password-rules" disabled={busy} value={password} onChange={e => setPassword(e.target.value)}/></div>
          <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" required disabled={busy} value={confirm} onChange={e => setConfirm(e.target.value)}/></div>
          <button type="button" className="link-button" aria-pressed={show} onClick={() => setShow(v => !v)}>{show ? 'Hide passwords' : 'Show passwords'}</button>
        </> : <><p className="auth-lead">Enter your registered work email to request a secure reset link.</p><div className="field"><label htmlFor="recovery-email">Email address</label><input id="recovery-email" type="email" autoComplete="email" maxLength={255} required disabled={busy} value={email} onChange={e => setEmail(e.target.value)}/></div></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-block" disabled={busy}>{busy ? 'Please wait...' : reset ? 'Update password' : 'Send reset instructions'}</button>
      </form>}
    <p className="auth-switch"><Link to="/login">Back to Login</Link></p>
    {error && reset && <Link to="/forgot-password">Request a new reset link</Link>}
  </AuthLayout>;
}
