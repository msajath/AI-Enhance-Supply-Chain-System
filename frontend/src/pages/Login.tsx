import { useRef, useState, type ReactNode } from 'react';
import { login, loginErrorMessage, type AuthUser } from '../services/auth';
import { Brand } from '../components/Brand';
import Icon from '../components/Icon';
import { SiteIllustration } from '../components/SiteIllustration';

type Theme = 'light' | 'dark';

/** Split sign-in layout: form on the left, the live construction-site drawing on the right. */
export function AuthLayout({ theme, toggleTheme, children }: { theme: Theme; toggleTheme: () => void; children: ReactNode }) {
  const themeLabel = `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`;
  return <main className={`login-page ${theme === 'dark' ? 'theme-dark' : ''}`}>
    <section className="auth-panel">
      <header className="auth-top">
        <Brand/>
        <button type="button" className="icon-button theme-toggle" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18}/></button>
      </header>
      <div className="auth-body">{children}</div>
      <footer className="auth-footer">© {new Date().getFullYear()} Qorvenz Technologies</footer>
    </section>
    <aside className="auth-visual">
      <SiteIllustration/>
      <p>Materials, warehouses and fleet for every site, in one place.</p>
    </aside>
  </main>;
}

export default function LoginPage({ onSignIn, sessionError, email, setEmail, theme, toggleTheme }: { onSignIn: (user: AuthUser) => void; sessionError: string; email: string; setEmail: (value: string) => void; theme: Theme; toggleTheme: () => void }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);
  const [showAccountHelp, setShowAccountHelp] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const next = {
      email: !email.trim() ? 'Email is required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address.' : '',
      password: !password ? 'Password is required.' : '',
    };
    setErrors(next);
    setLoginError('');
    if (next.email || next.password) {
      document.getElementById(next.email ? 'login-email' : 'login-password')?.focus();
      return;
    }
    submitting.current = true;
    setLoading(true);
    const credentials = { email: email.trim(), password };
    setPassword('');
    try { onSignIn(await login(credentials)); }
    catch (error) { setLoginError(loginErrorMessage(error)); }
    finally { submitting.current = false; setLoading(false); }
  };

  return <AuthLayout theme={theme} toggleTheme={toggleTheme}>
    <h1 className="auth-title">Sign in to your workspace</h1>
    <p className="auth-lead">Use your Qorvenz work account.</p>
    {sessionError && <p className="form-error" role="status">{sessionError}</p>}
    <form className="auth-form" noValidate onSubmit={submit} aria-busy={loading}>
      <div className="field">
        <label htmlFor="login-email">Work email</label>
        <input id="login-email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} disabled={loading} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com"/>
        {errors.email && <p id="email-error" className="field-error" role="alert">{errors.email}</p>}
      </div>
      <div className="field">
        <div className="field-row">
          <label htmlFor="login-password">Password</label>
          <button type="button" className="link-button" onClick={() => setShowResetHelp((v) => !v)} aria-expanded={showResetHelp}>Forgot password?</button>
        </div>
        <div className="input-with-action">
          <input id="login-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} disabled={loading} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)}/>
          <button type="button" className="input-action" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
        </div>
        {showResetHelp && <p className="field-hint">Ask your workspace administrator to reset it for you.</p>}
        {errors.password && <p id="password-error" className="field-error" role="alert">{errors.password}</p>}
      </div>
      {loginError && <div className="form-error" role="alert">{loginError}</div>}
      <button type="submit" className="button button-primary button-block" disabled={loading}>
        {loading ? <><span className="spinner" aria-hidden="true"/>Signing in...</> : 'Sign in'}
      </button>
    </form>
    {/* Accounts are created by an administrator (Users page); the API refuses public sign-up. */}
    <p className="auth-switch">New to Qorvenz? <button type="button" className="link-button" onClick={() => setShowAccountHelp((v) => !v)} aria-expanded={showAccountHelp}>How do I get an account?</button></p>
    {showAccountHelp && <p className="field-hint">Your workspace administrator creates your account and gives you access to your projects and warehouses.</p>}
  </AuthLayout>;
}
