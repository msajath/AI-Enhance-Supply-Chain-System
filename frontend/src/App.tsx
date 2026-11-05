import { useEffect, useMemo, useRef, useState } from 'react';

import { login, signup, logout, restoreSession, loginErrorMessage, signupErrorMessage, AuthUser } from './services/auth';
import { ProjectsPage } from './pages/Projects';
import { SitesPage } from './pages/Sites';
import { SiteIllustration } from './components/SiteIllustration';

type Role = AuthUser['role'];
type IconName = 'grid' | 'box' | 'truck' | 'users' | 'chart' | 'settings' | 'search' | 'clock' | 'pin' | 'check' | 'plus' | 'filter' | 'more' | 'menu' | 'close' | 'logout' | 'package' | 'route' | 'sun' | 'moon' | 'building';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/></>,
    truck: <><path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="17.5" cy="18" r="1.5"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.4.8l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.4-.8l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.4-.8l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.4.8l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z" transform="translate(-1 -1)"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>, plus: <><path d="M12 5v14M5 12h14"/></>, filter: <><path d="M4 6h16M7 12h10m-7 6h4"/></>, more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>, menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>, close: <><path d="m18 6-12 12M6 6l12 12"/></>, logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    package: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>, route: <><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M8.5 16.5 15.5 7.5M10 6H7a3 3 0 0 0-3 3v3m10 6h3a3 3 0 0 0 3-3v-3"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>, moon: <><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></>,
    building: <><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18"/><path d="M8 8h2M8 12h2M8 16h2M17 13h0M17 17h0"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true">Q</span><span className="brand-name">qorvenz</span></div>;
}

const navItems: { label: string; icon: IconName }[] = [
  { label: 'Overview', icon: 'grid' }, { label: 'Projects', icon: 'building' }, { label: 'Sites', icon: 'pin' },
  { label: 'Inventory', icon: 'box' },
  { label: 'Deliveries', icon: 'truck' }, { label: 'Team', icon: 'users' },
  { label: 'Analytics', icon: 'chart' }, { label: 'Settings', icon: 'settings' }
];

// Sample data for the overview until the stock and delivery APIs exist (Sprints 4–7).
// Mirrors the Sprint 1 fixture plan (docs/sprint-01/09).
const deliveries = [
  { id: 'DLV-1004', destination: 'Matara Bridge — River Works', address: 'SITE-MAT-01 · from WH-CEN', items: 'Steel rebar 12 mm, 6 t', driver: 'Driver One', initials: 'D1', time: '09:00', status: 'In transit', color: 'blue' },
  { id: 'DLV-1003', destination: 'Galle Road Apartments', address: 'SITE-GAL-01 · from WH-CEN', items: 'Portland cement, 240 bags', driver: 'Driver Two', initials: 'D2', time: '10:30', status: 'Preparing', color: 'amber' },
  { id: 'DLV-1002', destination: 'Galle Road Apartments', address: 'SITE-GAL-01 · from WH-CEN', items: 'River sand, 12 m³', driver: 'Driver One', initials: 'D1', time: '13:00', status: 'Delivered', color: 'green' },
  { id: 'DLV-1001', destination: 'Matara Bridge — River Works', address: 'SITE-MAT-01 · from WH-CEN', items: 'Standard brick, 2,000', driver: 'Driver Two', initials: 'D2', time: '15:30', status: 'Delivered', color: 'green' },
];
const stock = [
  { name: 'Portland cement 50 kg', sku: 'MAT-CEM-50', category: 'Cement', qty: '1,240', unit: 'bags', trend: 'OK', tone: 'positive', level: 74 },
  { name: 'Steel rebar 12 mm', sku: 'MAT-STL-12', category: 'Steel', qty: '8.0', unit: 't', trend: 'OK', tone: 'positive', level: 52 },
  { name: 'Steel rebar 12 mm (WH-MAT)', sku: 'MAT-STL-12', category: 'Steel', qty: '1.0', unit: 't', trend: 'Below reorder', tone: 'warning', level: 20 },
  { name: 'River sand', sku: 'MAT-SND-RV', category: 'Aggregates', qty: '46', unit: 'm³', trend: 'OK', tone: 'positive', level: 41 },
];

function greeting(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    let active = true;
    restoreSession().then(user => { if (active) setUser(user); }).catch(() => { if (active) setSessionError('Unable to restore your session. Please sign in again.'); }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);
  const role = user?.role ?? 'Driver';
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('qorvenz-theme') === 'dark' ? 'dark' : 'light');
  const [email, setEmail] = useState('');
  const [activePage, setActivePage] = useState('Overview');
  const [sitesProjectId, setSitesProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All status');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [completed, setCompleted] = useState(false);
  const isDriver = role === 'Driver';
  const isWarehouse = role === 'Warehouse manager';
  const profile = { name: user?.full_name ?? '', initials: (user?.full_name ?? '').split(' ').map(part => part[0]).join('').slice(0, 2) };
  const availableNavItems = role === 'Admin'
    ? navItems
    : role === 'Warehouse manager'
      ? navItems.filter((item) => ['Overview', 'Projects', 'Sites', 'Inventory', 'Deliveries'].includes(item.label))
      : navItems.filter((item) => ['Overview', 'Deliveries'].includes(item.label));
  const activeIndex = Math.max(0, availableNavItems.findIndex((item) => item.label === activePage));
  const visibleDeliveries = useMemo(() => deliveries.filter((item) => {
    const matches = `${item.id} ${item.destination} ${item.driver} ${item.items}`.toLowerCase().includes(query.toLowerCase());
    return matches && (filter === 'All status' || item.status === filter);
  }), [query, filter]);
  const announce = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800); };

  const signIn = (authenticatedUser: AuthUser) => {
    setSessionError('');
    setUser(authenticatedUser);
    setActivePage('Overview');
    setQuery('');
  };
  const toggleTheme = () => setTheme((current) => {
    const next = current === 'light' ? 'dark' : 'light';
    localStorage.setItem('qorvenz-theme', next);
    return next;
  });
  const open = (page: string) => { setActivePage(page); setSitesProjectId(''); setMenuOpen(false); };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await logout(); setUser(null); setEmail(''); setMenuOpen(false); setCompleted(false); }
    catch { announce('Unable to sign out. Please try again.'); }
    finally { setSigningOut(false); }
  };
  if (restoring) return <main className={`login-page restoring ${theme === 'dark' ? 'theme-dark' : ''}`}><p role="status">Restoring your session...</p></main>;
  if (!user) return <LoginPage onSignIn={signIn} sessionError={sessionError} email={email} setEmail={setEmail} theme={theme} toggleTheme={toggleTheme}/>;

  const themeLabel = `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`;
  return <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top">
        <Brand/>
        <button className="mobile-close icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu"><Icon name="close"/></button>
      </div>
      <p className="org-name">Qorvenz Construction</p>
      <nav className="main-nav" aria-label="Main navigation">
        <span className="nav-indicator" aria-hidden="true" style={{ transform: `translateY(${activeIndex * 42}px)` }}/>
        {availableNavItems.map((item) => <button key={item.label} className={`nav-item ${activePage === item.label ? 'selected' : ''}`} aria-current={activePage === item.label ? 'page' : undefined} onClick={() => open(item.label)}><Icon name={item.icon}/><span>{item.label}</span></button>)}
      </nav>
      <button className="profile" onClick={signOut} disabled={signingOut} title="Sign out">
        <span className="avatar">{profile.initials}</span>
        <span className="profile-copy"><strong>{profile.name}</strong><small>{role}</small></span>
        <Icon name="logout"/>
      </button>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
    <main className="main-content">
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Icon name="menu"/></button>
        <span className="topbar-title">{activePage}</span>
        <div className="top-actions">
          <span className="role-badge">{role}</span>
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={17}/></button>
        </div>
      </header>
      <div className="page-wrap" key={activePage}>
        {activePage === 'Overview' ? <>
          <section className="hero">
            <div className="hero-copy">
              <p className="hero-date">{today()}</p>
              <h1>{greeting()}, {profile.name.split(' ')[0]}</h1>
              <p>{isDriver ? 'Your stops for today are below.' : isWarehouse ? 'This is what is moving through your warehouses today.' : 'This is what is moving across your sites today.'}</p>
              <button className="button button-primary" onClick={() => announce(isDriver ? 'Route opened' : 'New delivery form opened')}><Icon name={isDriver ? 'route' : 'plus'} size={17}/>{isDriver ? 'Open my route' : 'New delivery'}</button>
            </div>
            <SiteIllustration className="compact"/>
          </section>
          {isDriver ? <DriverDashboard completed={completed} setCompleted={setCompleted} announce={announce}/> : <>
            <section className="figures" aria-label="Key figures">
              <Figure title={isWarehouse ? 'Items in stock' : 'Inventory value'} value={isWarehouse ? '12,486' : 'LKR 84.6 M'} note={isWarehouse ? 'across 6 materials' : '+8.2% on last month'}/>
              <Figure title="Deliveries today" value={isWarehouse ? '3' : '4'} note="2 on the road"/>
              <Figure title={isWarehouse ? 'Below reorder level' : 'Approved suppliers'} value={isWarehouse ? '1' : '2'} note={isWarehouse ? 'steel 12 mm at WH-MAT' : '1 suspended'} tone={isWarehouse ? 'warning' : undefined}/>
              <Figure title="On-time delivery" value="96%" note="last 30 days"/>
            </section>
            <p className="sample-note">Sample data. Live figures arrive with the stock and delivery modules.</p>
            <section className="content-grid">
              <div className="panel delivery-panel">
                <div className="panel-heading">
                  <div><h2>{isWarehouse ? 'Outbound deliveries' : 'Deliveries today'}</h2><p>{visibleDeliveries.length} of {deliveries.length} shown</p></div>
                  <button className="text-button" onClick={() => open('Deliveries')}>View all</button>
                </div>
                <div className="table-tools">
                  <label className="search-box"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search deliveries" aria-label="Search deliveries"/></label>
                  <label className="filter-select"><Icon name="filter" size={15}/><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by status"><option>All status</option><option>Preparing</option><option>In transit</option><option>Delivered</option></select></label>
                </div>
                <div className="table-scroll"><table><thead><tr><th>Delivery</th><th>Destination</th><th>Driver</th><th>Time</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody key={`${query}|${filter}`}>{visibleDeliveries.map((delivery) => <tr key={delivery.id}><td><strong className="mono-id">{delivery.id}</strong><small>{delivery.items}</small></td><td><strong>{delivery.destination}</strong><small>{delivery.address}</small></td><td><div className="driver-cell"><span className="avatar avatar-sm">{delivery.initials}</span><span>{delivery.driver}</span></div></td><td className="num">{delivery.time}</td><td><span className={`status status-${delivery.color}`}><i/>{delivery.status}</span></td><td className="cell-actions"><button className="icon-button" aria-label={`More options for ${delivery.id}`} onClick={() => announce(`Delivery ${delivery.id}`)}><Icon name="more"/></button></td></tr>)}</tbody></table>{visibleDeliveries.length === 0 && <div className="empty-state">No deliveries match your search.</div>}</div>
              </div>
              <div className="right-column"><StockPanel isWarehouse={isWarehouse} onOpen={() => open('Inventory')}/><ActivityPanel/></div>
            </section>
          </>}
        </> : activePage === 'Projects' ? <ProjectsPage onViewSites={(projectId) => { setSitesProjectId(projectId); setActivePage('Sites'); }}/>
        : activePage === 'Sites' ? <SitesPage key={sitesProjectId} initialProjectId={sitesProjectId}/>
        : <OtherPage page={activePage} role={role} query={query} setQuery={setQuery} announce={announce}/>}
        <footer className="page-footer"><span>© 2026 Qorvenz Technologies</span><span>Version 1.0.0</span></footer>
      </div>
    </main>
    {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={14}/></span>{notice}</div>}
  </div>;
}

function AuthLayout({ theme, toggleTheme, children }: { theme: 'light' | 'dark'; toggleTheme: () => void; children: React.ReactNode }) {
  const themeLabel = `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`;
  return <main className={`login-page ${theme === 'dark' ? 'theme-dark' : ''}`}>
    <section className="auth-panel">
      <header className="auth-top">
        <Brand/>
        <button type="button" className="icon-button theme-toggle" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18}/></button>
      </header>
      <div className="auth-body">{children}</div>
      <footer className="auth-footer">© 2026 Qorvenz Technologies</footer>
    </section>
    <aside className="auth-visual">
      <SiteIllustration/>
      <p>Materials, warehouses and deliveries for every site, in one place.</p>
    </aside>
  </main>;
}

function LoginPage({ onSignIn, sessionError, email, setEmail, theme, toggleTheme }: { onSignIn: (user: AuthUser) => void; sessionError: string; email: string; setEmail: (value: string) => void; theme: 'light' | 'dark'; toggleTheme: () => void }) {
  const [signupMode, setSignupMode] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);
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
  if (signupMode) return <SignupPage onSignIn={onSignIn} theme={theme} toggleTheme={toggleTheme} onBackToLogin={() => setSignupMode(false)}/>;
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
    <p className="auth-switch">New to Qorvenz? <button type="button" className="link-button" onClick={() => setSignupMode(true)}>Create an account</button></p>
  </AuthLayout>;
}

function SignupPage({ onSignIn, theme, toggleTheme, onBackToLogin }: { onSignIn: (user: AuthUser) => void; theme: 'light' | 'dark'; toggleTheme: () => void; onBackToLogin: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 8) {
      setError('Enter your name, a valid email, and a password with at least 8 characters.');
      return;
    }
    setLoading(true); setError('');
    try { onSignIn(await signup({ fullName: fullName.trim(), email: email.trim(), password })); }
    catch (submitError) { setError(signupErrorMessage(submitError)); }
    finally { setLoading(false); }
  };
  return <AuthLayout theme={theme} toggleTheme={toggleTheme}>
    <h1 className="auth-title">Create your account</h1>
    <p className="auth-lead">New accounts start with driver access. An administrator can change your role.</p>
    <form className="auth-form" noValidate onSubmit={submit} aria-busy={loading}>
      <div className="field"><label htmlFor="signup-name">Full name</label><input id="signup-name" disabled={loading} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)}/></div>
      <div className="field"><label htmlFor="signup-email">Work email</label><input id="signup-email" disabled={loading} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com"/></div>
      <div className="field"><label htmlFor="signup-password">Password</label><input id="signup-password" disabled={loading} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters"/></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="button button-primary button-block" disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</button>
    </form>
    <p className="auth-switch">Already have an account? <button type="button" className="link-button" onClick={onBackToLogin}>Sign in instead</button></p>
  </AuthLayout>;
}

function Figure({ title, value, note, tone }: { title: string; value: string; note: string; tone?: 'warning' }) {
  return <div className={`figure ${tone ? `figure-${tone}` : ''}`}><span className="figure-title">{title}</span><strong className="figure-value">{value}</strong><span className="figure-note">{note}</span></div>;
}

function StockPanel({ isWarehouse, onOpen }: { isWarehouse: boolean; onOpen: () => void }) {
  return <section className="panel stock-panel">
    <div className="panel-heading"><div><h2>{isWarehouse ? 'Stock levels' : 'Key materials'}</h2><p>Against reorder level</p></div><button className="text-button" onClick={onOpen}>Inventory</button></div>
    <ul className="stock-list">{stock.map((item) => <li className="stock-row" key={`${item.sku}-${item.name}`}>
      <div className="stock-info"><strong>{item.name}</strong><small>{item.sku}</small></div>
      <div className="stock-amount"><strong className="num">{item.qty}</strong><small>{item.unit}</small></div>
      <div className={`stock-bar ${item.tone}`}><span style={{ width: `${item.level}%` }}/></div>
      {item.tone === 'warning' && <span className="stock-flag">{item.trend}</span>}
    </li>)}</ul>
  </section>;
}

function ActivityPanel() {
  const events = [
    { text: 'DLV-1002 delivered to Galle Road Apartments', time: '12 min ago' },
    { text: '120 bags of cement received at WH-CEN', time: '38 min ago' },
    { text: 'Lanka Steel Traders approved as a supplier', time: '1 hour ago' },
  ];
  return <section className="panel activity-panel">
    <div className="panel-heading"><div><h2>Recent activity</h2><p>Across your sites</p></div></div>
    <ol className="activity-list">{events.map((event) => <li key={event.time}><p>{event.text}</p><small>{event.time}</small></li>)}</ol>
  </section>;
}

function DriverDashboard({ completed, setCompleted, announce }: { completed: boolean; setCompleted: (next: boolean) => void; announce: (message: string) => void }) {
  return <>
    <section className="route-summary" aria-label="Today's route">
      <div><span className="figure-title">Route</span><strong>WH-CEN to Galle and Matara</strong></div>
      <div><span className="figure-title">Stops</span><strong className="num">4</strong></div>
      <div><span className="figure-title">Distance</span><strong className="num">162 km</strong></div>
      <div><span className="figure-title">Status</span><span className="status status-green"><i/>On schedule</span></div>
    </section>
    <section className="panel route-panel">
      <div className="panel-heading"><div><h2>Stops</h2><p>{completed ? '1' : '0'} of 4 completed</p></div></div>
      <ol className="route-stop-list">{deliveries.map((stop, index) => {
        const done = completed && index === 0;
        const current = !completed && index === 0;
        return <li className={`route-stop ${done ? 'stop-done' : ''} ${current ? 'stop-current' : ''}`} key={stop.id}>
          <span className="stop-marker" aria-hidden="true">{done ? <Icon name="check" size={14}/> : index + 1}</span>
          <div className="stop-body">
            <div className="stop-top">
              <div><span className="stop-time num">{stop.time}</span><h3>{stop.destination}</h3><p>{stop.address}</p></div>
              <span className={`status status-${done ? 'green' : stop.color}`}><i/>{done ? 'Delivered' : current ? 'Next stop' : stop.status}</span>
            </div>
            <p className="stop-load"><span className="mono-id">{stop.id}</span> {stop.items}</p>
            {current && <button className="button button-primary" onClick={() => { setCompleted(true); announce('Delivery marked as delivered'); }}><Icon name="check" size={16}/> Mark as delivered</button>}
          </div>
        </li>;
      })}</ol>
    </section>
  </>;
}

function OtherPage({ page, role, query, setQuery, announce }: { page: string; role: Role; query: string; setQuery: (value: string) => void; announce: (message: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const headings: Record<string, string> = { Inventory: role === 'Warehouse manager' ? 'Warehouse inventory' : 'Inventory', Deliveries: 'Deliveries', Team: 'Team', Analytics: 'Analytics', Settings: 'Settings' };
  const descriptions: Record<string, string> = { Inventory: 'Materials and stock across your warehouses.', Deliveries: 'Deliveries from warehouse to site.', Team: 'People with access to this workspace.', Analytics: 'Performance over the last 30 days.', Settings: 'Workspace preferences and access.' };
  const people = [
    { name: 'Demo Administrator', role: 'Admin', status: 'Active', initials: 'DA' },
    { name: 'Central Warehouse Manager', role: 'Warehouse manager', status: 'Active', initials: 'CW' },
    { name: 'Matara Site Storekeeper', role: 'Warehouse manager', status: 'Active', initials: 'MS' },
    { name: 'Driver One', role: 'Driver', status: 'On route', initials: 'D1' },
  ].filter((person) => `${person.name} ${person.role}`.toLowerCase().includes(query.toLowerCase()));
  const filteredStock = stock.filter((item) => `${item.name} ${item.sku}`.toLowerCase().includes(query.toLowerCase()));
  const filteredDeliveries = deliveries.filter((item) => `${item.id} ${item.destination}`.toLowerCase().includes(query.toLowerCase()));
  let rows: React.ReactNode = null;
  if (page === 'Inventory') rows = filteredStock.map((item) => <tr key={`${item.sku}-${item.name}`}><td><strong>{item.name}</strong><small>{item.sku}</small></td><td>{item.category}</td><td className="num">{item.qty} {item.unit}</td><td><span className={`status ${item.tone === 'warning' ? 'status-amber' : 'status-green'}`}><i/>{item.tone === 'warning' ? 'Below reorder' : 'In stock'}</span></td></tr>);
  if (page === 'Team') rows = people.map((person) => <tr key={person.name}><td><div className="driver-cell"><span className="avatar avatar-sm">{person.initials}</span><strong>{person.name}</strong></div></td><td>{person.role}</td><td>{person.status}</td><td><span className="status status-green"><i/>Active</span></td></tr>);
  if (page === 'Deliveries') rows = filteredDeliveries.map((item) => <tr key={item.id}><td><strong className="mono-id">{item.id}</strong><small>{item.items}</small></td><td>{item.destination}</td><td>{item.driver}</td><td><span className={`status status-${item.color}`}><i/>{item.status}</span></td></tr>);
  const action = page === 'Team' ? 'Invite member' : page === 'Inventory' ? 'Add material' : 'New delivery';
  return <>
    <div className="page-heading">
      <div><h1>{headings[page] ?? page}</h1><p>{descriptions[page] ?? 'Manage your supply chain workspace.'}</p></div>
      {page !== 'Settings' && page !== 'Analytics' && <button className="button button-primary" onClick={() => setShowForm(!showForm)} aria-expanded={showForm}><Icon name="plus" size={17}/>{action}</button>}
    </div>
    {showForm && <div className="inline-note"><p><strong>{action}</strong> arrives in a later sprint. This page shows sample data for now.</p><button className="button button-outline" onClick={() => { setShowForm(false); announce('Noted'); }}>Close</button></div>}
    <div className="panel listing-panel">
      <div className="panel-heading">
        <div><h2>{page === 'Inventory' ? 'All materials' : page === 'Deliveries' ? 'All deliveries' : page === 'Team' ? 'Members' : page === 'Analytics' ? 'Last 30 days' : 'General'}</h2><p>Sample data</p></div>
        {page !== 'Settings' && page !== 'Analytics' && <label className="search-box listing-search"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${page.toLowerCase()}`} aria-label={`Search ${page}`}/></label>}
      </div>
      {page === 'Settings' ? <dl className="settings-list"><div><dt>Workspace</dt><dd>Qorvenz Construction</dd></div><div><dt>Your role</dt><dd>{role}</dd></div><div><dt>Notifications</dt><dd>Delivery alerts and stock warnings on</dd></div></dl>
        : page === 'Analytics' ? <section className="figures figures-inline" aria-label="Analytics"><Figure title="Deliveries completed" value="128" note="+12.8% on previous month"/><Figure title="Average lead time" value="2.4 days" note="0.3 days faster"/><Figure title="Stock turnover" value="6.8×" note="+0.6× on previous month"/></section>
        : <div className="table-scroll"><table><thead><tr><th>{page === 'Inventory' ? 'Material' : page === 'Team' ? 'Member' : 'Delivery'}</th><th>{page === 'Inventory' ? 'Category' : page === 'Team' ? 'Role' : 'Destination'}</th><th>{page === 'Inventory' ? 'In stock' : page === 'Team' ? 'Status' : 'Driver'}</th><th>Status</th></tr></thead><tbody>{rows}</tbody></table></div>}
    </div>
  </>;
}

export default App;
