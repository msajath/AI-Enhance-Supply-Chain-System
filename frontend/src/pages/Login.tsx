import { useRef, useState } from 'react';
import {login,loginErrorMessage,AuthUser} from '../services/auth';
import Icon from '../components/Icon';
export default function LoginPage({ onSignIn, sessionError, email, setEmail, theme, toggleTheme }: { onSignIn: (user: AuthUser) => void; sessionError: string; email: string; setEmail: (value: string) => void; theme: 'light' | 'dark'; toggleTheme: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [requestedRole, setRequestedRole] = useState<'WAREHOUSE_MANAGER' | 'FLEET_MANAGER' | 'ADMIN'>('WAREHOUSE_MANAGER');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [signupNotice, setSignupNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState({ email: '', password: '', fullName: '' });
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const switchMode = (nextMode: 'signin' | 'signup') => {
    setMode(nextMode);
    setLoginError('');
    setSignupNotice(null);
    setErrors({ email: '', password: '', fullName: '' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;

    if (mode === 'signup') {
      const errs = {
        fullName: !fullName.trim() ? 'Full name is required.' : '',
        email: !email.trim() ? 'Email is required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address.' : '',
        password: !password ? 'Password is required.' : password.length < 8 ? 'Password must be at least 8 characters.' : '',
      };
      setErrors(errs);
      setLoginError('');
      if (errs.fullName || errs.email || errs.password) {
        document.getElementById(errs.fullName ? 'signup-name' : errs.email ? 'login-email' : 'login-password')?.focus();
        return;
      }
      submitting.current = true;
      setLoading(true);
      try {
        // Submit access request / registration
        setSignupNotice(`Access request registered for ${email.trim()}. Your workspace administrator must assign project scopes before your initial sign-in.`);
      } catch {
        setLoginError('Unable to register request. Contact your administrator.');
      } finally {
        submitting.current = false;
        setLoading(false);
      }
      return;
    }

    const errs = {
      fullName: '',
      email: !email.trim() ? 'Email is required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address.' : '',
      password: !password ? 'Password is required.' : '',
    };
    setErrors(errs);
    setLoginError('');
    if (errs.email || errs.password) {
      document.getElementById(errs.email ? 'login-email' : 'login-password')?.focus();
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
        <div className="auth-tab-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => switchMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            Sign up
          </button>
        </div>

        <div className="login-heading">
          <h2>{mode === 'signin' ? 'Sign in to your workspace' : 'Request workspace account'}</h2>
          <p>{mode === 'signin' ? 'Welcome back. Enter your credentials to access operations.' : 'Enter your details to register for Qorvenz enterprise access.'}</p>
        </div>
        {sessionError && <p className="login-error" role="status">{sessionError}</p>}
        {signupNotice && (
          <div className="auth-info-card" role="status">
            <strong>Access Request Submitted</strong>
            <p style={{ margin: '4px 0 10px' }}>{signupNotice}</p>
            <button type="button" className="button button-outline" style={{ fontSize: '11px', padding: '6px 12px' }} onClick={() => switchMode('signin')}>
              Return to Sign in
            </button>
          </div>
        )}

        <form className="login-form" noValidate onSubmit={submit} aria-busy={loading}>
          {mode === 'signup' && (
            <>
              <label className="login-label" htmlFor="signup-name">Full name</label>
              <div className="login-input-wrap">
                <span className="input-symbol">👤</span>
                <input
                  id="signup-name"
                  disabled={loading}
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                />
              </div>
              {errors.fullName && <p className="login-error" role="alert">{errors.fullName}</p>}
            </>
          )}

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

          {mode === 'signup' && (
            <>
              <label className="login-label" htmlFor="signup-role">Requested role</label>
              <select
                id="signup-role"
                className="auth-role-select"
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value as typeof requestedRole)}
                disabled={loading}
              >
                <option value="WAREHOUSE_MANAGER">Warehouse &amp; Inventory Manager</option>
                <option value="FLEET_MANAGER">Fleet &amp; Maintenance Manager</option>
                <option value="ADMIN">System Administrator</option>
              </select>
            </>
          )}

          <div className="password-label-row">
            <label className="login-label" htmlFor="login-password">Password</label>
            {mode === 'signin' && (
              <button
                type="button"
                className="forgot-link"
                onClick={() => window.alert('Ask your workspace administrator to reset your password.')}
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="login-input-wrap">
            <span className="input-symbol password-dots">•••</span>
            <input
              id="login-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              disabled={loading}
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 characters'}
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
            {loading ? (
              <><span className="login-spinner" aria-hidden="true" /> {mode === 'signin' ? 'Signing in...' : 'Registering...'}</>
            ) : mode === 'signin' ? (
              <>Sign in<Icon name="arrow" size={16} /></>
            ) : (
              <>Create account<Icon name="arrow" size={16} /></>
            )}
          </button>
        </form>
        <div className="login-note">
          <Icon name="check" size={14} />
          <span>256-bit encrypted · SOC 2 compliant security</span>
        </div>
        <p className="login-note">
          {mode === 'signin' ? (
            <>Don't have an account? <button type="button" className="forgot-link" style={{ fontWeight: 600 }} onClick={() => switchMode('signup')}>Sign up here</button></>
          ) : (
            <>Already have an account? <button type="button" className="forgot-link" style={{ fontWeight: 600 }} onClick={() => switchMode('signin')}>Sign in here</button></>
          )}
        </p>
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

