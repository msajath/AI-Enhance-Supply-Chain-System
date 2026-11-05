import { useRef, useState, type ReactNode } from 'react';
import { login, loginErrorMessage, requestAccess, requestErrorMessage, type AuthUser, type RequestedRole } from '../services/auth';
import { Brand } from '../components/Brand';
import Icon from '../components/Icon';
import { SiteIllustration } from '../components/SiteIllustration';

type Theme = 'light' | 'dark';

/** Split sign-in layout: form on the left, the live construction-site drawing on the right. */
export function AuthLayout({ theme, toggleTheme, children, dense = false }: { theme: Theme; toggleTheme: () => void; children: ReactNode; dense?: boolean }) {
  const themeLabel = `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`;
  return <main className={`login-page ${dense ? 'login-dense' : ''} ${theme === 'dark' ? 'theme-dark' : ''}`}>
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

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@demo.qorvenz.test', password: 'Password123!', icon: 'settings' as const },
  { role: 'Fleet Manager', email: 'fleet@demo.qorvenz.test', password: 'Password123!', icon: 'truck' as const },
  { role: 'Warehouse Manager', email: 'warehouse.cen@demo.qorvenz.test', password: 'Password123!', icon: 'package' as const },
] as const;

export default function LoginPage({ onSignIn, sessionError, email, setEmail, theme, toggleTheme }: { onSignIn: (user: AuthUser) => void; sessionError: string; email: string; setEmail: (value: string) => void; theme: Theme; toggleTheme: () => void }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const fillDemoAccount = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email);
    setPassword(account.password);
    setErrors({ email: '', password: '' });
    setLoginError('');
  };

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

  if (requesting) return <RequestAccessPage theme={theme} toggleTheme={toggleTheme} onBack={() => setRequesting(false)}/>;
  return <AuthLayout theme={theme} toggleTheme={toggleTheme}>
    <h1 className="auth-title">Sign in to your workspace</h1>
    <p className="auth-lead">Use your Qorvenz work account.</p>
    <div className="demo-accounts-panel">
      <div className="demo-accounts-top">
        <span className="demo-badge">Quick Demo Access</span>
        <span className="demo-password-note">Password: <code>Password123!</code></span>
      </div>
      <div className="demo-accounts-list">
        {DEMO_ACCOUNTS.map((acc) => {
          const isSelected = email === acc.email;
          return (
            <button
              key={acc.email}
              type="button"
              className={`demo-row-btn ${isSelected ? 'selected' : ''}`}
              onClick={() => fillDemoAccount(acc)}
              title={`Fill ${acc.role} credentials`}
            >
              <div className="demo-row-left">
                <span className="demo-row-icon"><Icon name={acc.icon} size={15}/></span>
                <strong className="demo-row-role">{acc.role}</strong>
              </div>
              <span className="demo-row-email">{acc.email}</span>
            </button>
          );
        })}
      </div>
    </div>
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
    <p className="auth-switch">New to Qorvenz? <button type="button" className="link-button" onClick={() => setRequesting(true)}>Request an account</button></p>
  </AuthLayout>;
}

const ROLE_OPTIONS: { value: RequestedRole; label: string; note: string; icon: 'box' | 'truck' | 'route' }[] = [
  { value: 'WAREHOUSE_MANAGER', label: 'Warehouse manager', note: 'Stock & stores', icon: 'box' },
  { value: 'FLEET_MANAGER', label: 'Fleet manager', note: 'Vehicles & drivers', icon: 'truck' },
  { value: 'DRIVER', label: 'Driver', note: 'My trips', icon: 'route' },
];

type RequestField = 'fullName' | 'email' | 'organizationCode' | 'password' | 'confirm';

/**
 * "Request an account" page. The request is saved on the server and an administrator
 * approves or rejects it under Admin > Access requests. Admin accounts cannot be requested.
 * Laid out in two columns so the whole form fits on one screen without scrolling.
 */
function RequestAccessPage({ theme, toggleTheme, onBack }: { theme: Theme; toggleTheme: () => void; onBack: () => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', organizationCode: '', requestedRole: 'WAREHOUSE_MANAGER' as RequestedRole, password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<RequestField, string>>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const submitting = useRef(false);
  const set = (key: RequestField) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const next: Partial<Record<RequestField, string>> = {};
    if (!form.fullName.trim()) next.fullName = 'Full name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!form.organizationCode.trim()) next.organizationCode = 'Company code is required.';
    if (form.password.length < 12) next.password = 'Use at least 12 characters.';
    else if (form.password !== form.confirm) next.confirm = 'Passwords do not match.';
    setErrors(next); setError('');
    const first = Object.keys(next)[0];
    if (first) { document.getElementById('request-' + first)?.focus(); return; }
    submitting.current = true; setLoading(true);
    try {
      await requestAccess({ fullName: form.fullName.trim(), email: form.email.trim(), organizationCode: form.organizationCode.trim(), requestedRole: form.requestedRole, password: form.password });
      setSent(true);
    } catch (submitError) { setError(requestErrorMessage(submitError)); }
    finally { submitting.current = false; setLoading(false); setForm((f) => ({ ...f, password: '', confirm: '' })); }
  };

  if (sent) return <AuthLayout theme={theme} toggleTheme={toggleTheme}>
    <span className="request-done" aria-hidden="true"><Icon name="check" size={22}/></span>
    <h1 className="auth-title">Request sent</h1>
    <p className="auth-lead">Your administrator will review it. Once it is approved you can sign in with <strong>{form.email.trim()}</strong> and the password you chose.</p>
    <button type="button" className="button button-primary button-block request-back" onClick={onBack}>Back to sign in</button>
  </AuthLayout>;

  const field = (key: RequestField, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, hint?: string, wide = false) =>
    <div className={`field ${wide ? 'field-wide' : ''}`}>
      <label htmlFor={'request-' + key}>{label}</label>
      <input id={'request-' + key} value={form[key]} onChange={set(key)} disabled={loading} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? 'request-' + key + '-error' : hint ? 'request-' + key + '-hint' : undefined} {...props}/>
      {errors[key] ? <p id={'request-' + key + '-error'} className="field-error" role="alert">{errors[key]}</p>
        : hint && <p id={'request-' + key + '-hint'} className="field-hint">{hint}</p>}
    </div>;

  return <AuthLayout theme={theme} toggleTheme={toggleTheme} dense>
    <h1 className="auth-title">Request an account</h1>
    <p className="auth-lead">Your administrator approves every new account.</p>
    <form className="auth-form request-form" noValidate onSubmit={submit} aria-busy={loading}>
      {field('fullName', 'Full name', { autoComplete: 'name' })}
      {field('email', 'Work email', { type: 'email', autoComplete: 'email', placeholder: 'name@company.com' })}
      {field('organizationCode', 'Company code', { autoComplete: 'organization', placeholder: 'e.g. QOR-HQ-01' }, 'Ask your administrator. It is shown on their Settings page.', true)}
      <fieldset className="field field-wide role-picker" disabled={loading}>
        <legend>Role you need</legend>
        <div className="role-options">
          {ROLE_OPTIONS.map((o) => <label key={o.value} className={`role-option ${form.requestedRole === o.value ? 'selected' : ''}`}>
            <input type="radio" name="requested-role" value={o.value} checked={form.requestedRole === o.value} onChange={() => setForm((f) => ({ ...f, requestedRole: o.value }))}/>
            <Icon name={o.icon} size={17}/>
            <span><strong>{o.label}</strong><small>{o.note}</small></span>
          </label>)}
        </div>
      </fieldset>
      {field('password', 'Password', { type: 'password', autoComplete: 'new-password' }, 'At least 12 characters.')}
      {field('confirm', 'Confirm password', { type: 'password', autoComplete: 'new-password' })}
      {error && <div className="form-error field-wide" role="alert">{error}</div>}
      <button type="submit" className="button button-primary button-block field-wide" disabled={loading}>
        {loading ? <><span className="spinner" aria-hidden="true"/>Sending request...</> : 'Send request'}
      </button>
    </form>
    <p className="auth-switch">Already have an account? <button type="button" className="link-button" onClick={onBack}>Sign in instead</button></p>
  </AuthLayout>;
}
