import { useRef, useState } from 'react';
import {login,loginErrorMessage,AuthUser} from '../services/auth';
import Icon from '../components/Icon';
export default function LoginPage({ onSignIn, sessionError, email, setEmail, theme, toggleTheme }: { onSignIn: (user: AuthUser) => void; sessionError: string; email: string; setEmail: (value: string) => void; theme: 'light' | 'dark'; toggleTheme: () => void }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const errors = {
      email: !email.trim() ? 'Email is required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address.' : '',
      password: !password ? 'Password is required.' : '',
    };
    setErrors(errors);
    setLoginError('');
    if (errors.email || errors.password) {
      document.getElementById(errors.email ? 'login-email' : 'login-password')?.focus();
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
  return <main className={`login-page ${theme === 'dark' ? 'theme-dark' : ''}`}>
    <div className="auth-ambient-glow" aria-hidden="true" />
    <div className="auth-grid-overlay" aria-hidden="true" />
    <header className="auth-navbar">
      <div className="auth-nav-brand">
        <div className="brand-mark">q<span>.</span></div>
        <div className="brand-copy">
          <strong>qorvenz</strong>
          <small>SUPPLY CHAIN</small>
        </div>
      </div>
      <div className="auth-nav-actions">
        <span className="live-status-pill"><i className="online-dot" /> Qorvenz workspace</span>
        <button
          type="button"
          className="icon-button theme-toggle auth-theme-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
        </button>
      </div>
    </header>

    <div className="auth-container">
      <div className="login-form-wrap">
        <div className="auth-card-badge">
          <div className="auth-logo-badge">
            <Icon name="truck" size={20} />
          </div>
          <span className="eyebrow">WORKSPACE PORTAL</span>
        </div>
        <div className="login-heading">
          <h2>Sign in to your workspace</h2>
          <p>Welcome back. Enter your credentials to access operations.</p>
        </div>
        {sessionError && <p className="login-error" role="status">{sessionError}</p>}
        <form className="login-form" noValidate onSubmit={submit} aria-busy={loading}>
          <label className="login-label" htmlFor="login-email">Work email</label>
          <div className="login-input-wrap">
            <span className="input-symbol">@</span>
            <input
              id="login-email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              disabled={loading}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </div>
          {errors.email && <p id="email-error" className="login-error" role="alert">{errors.email}</p>}
          <div className="password-label-row">
            <label className="login-label" htmlFor="login-password">Password</label>
            <button
              type="button"
              className="forgot-link"
              onClick={() => window.alert('Ask your workspace administrator to reset your password.')}
            >
              Forgot password?
            </button>
          </div>
          <div className="login-input-wrap">
            <span className="input-symbol password-dots">•••</span>
            <input
              id="login-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              disabled={loading}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="show-password"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {errors.password && <p id="password-error" className="login-error" role="alert">{errors.password}</p>}
          {loginError && <div className="login-error" role="alert">{loginError}</div>}
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? <><span className="login-spinner" aria-hidden="true" /> Signing in...</> : <>Sign in<Icon name="arrow" size={16} /></>}
          </button>
        </form>
        <div className="login-note">
          <Icon name="check" size={14} />
          <span>256-bit encrypted · SOC 2 compliant security</span>
        </div>
        <p className="login-note">Need access? Contact your workspace administrator.</p>
      </div>

      <div className="auth-features-strip" aria-hidden="true">
        <div className="auth-feature-chip"><Icon name="truck" size={14} /> Fleet & maintenance</div>
        <div className="auth-feature-chip"><Icon name="box" size={14} /> Warehouse operations</div>
        <div className="auth-feature-chip"><Icon name="chart" size={14} /> Project access controls</div>
      </div>
    </div>

    <footer className="auth-footer">
      <span>Built for the teams that build the modern world</span>
      <span>© 2026 Qorvenz Technologies Inc.</span>
    </footer>
  </main>;
}

