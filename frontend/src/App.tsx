import { useEffect, useMemo, useRef, useState } from 'react';

import { login, signup, logout, restoreSession, loginErrorMessage, signupErrorMessage, AuthUser } from './services/auth';
import { ProjectsPage } from './pages/Projects';
import { SitesPage } from './pages/Sites';

type Role = AuthUser['role'];
type IconName = 'grid' | 'box' | 'truck' | 'users' | 'chart' | 'settings' | 'search' | 'bell' | 'arrow' | 'clock' | 'pin' | 'check' | 'plus' | 'filter' | 'more' | 'menu' | 'close' | 'logout' | 'package' | 'route' | 'sun' | 'moon' | 'building';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/></>,
    truck: <><path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="17.5" cy="18" r="1.5"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.4.8l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.4-.8l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.4-.8l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.4.8l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z" transform="translate(-1 -1)"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>, plus: <><path d="M12 5v14M5 12h14"/></>, filter: <><path d="M4 6h16M7 12h10m-7 6h4"/></>, more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>, menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>, close: <><path d="m18 6-12 12M6 6l12 12"/></>, logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    package: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>, route: <><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M8.5 16.5 15.5 7.5M10 6H7a3 3 0 0 0-3 3v3m10 6h3a3 3 0 0 0 3-3v-3"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>, moon: <><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></>,
    building: <><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18"/><path d="M8 8h2M8 12h2M8 16h2M17 13h0M17 17h0"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const navItems: { label: string; icon: IconName }[] = [
  { label: 'Overview', icon: 'grid' }, { label: 'Projects', icon: 'building' }, { label: 'Sites', icon: 'pin' },
  { label: 'Inventory', icon: 'box' },
  { label: 'Deliveries', icon: 'truck' }, { label: 'Team', icon: 'users' },
  { label: 'Analytics', icon: 'chart' }, { label: 'Settings', icon: 'settings' }
];
const deliveries = [
  { id: 'DLV-2048', destination: 'Northpoint Construction', address: '1280 Harbor Blvd, Seattle', items: 'Cement · 240 bags', driver: 'Marcus Chen', initials: 'MC', time: '09:30 AM', status: 'In transit', color: 'blue' },
  { id: 'DLV-2047', destination: 'Evergreen Residences', address: '442 Pine Street, Bellevue', items: 'Steel rebar · 3.2 tons', driver: 'Sarah Johnson', initials: 'SJ', time: '10:15 AM', status: 'Preparing', color: 'amber' },
  { id: 'DLV-2046', destination: 'Riverside Commercial', address: '89 Westlake Ave, Seattle', items: 'Lumber · 180 pieces', driver: 'David Kim', initials: 'DK', time: '11:00 AM', status: 'Delivered', color: 'green' },
  { id: 'DLV-2045', destination: 'Summit View Builders', address: '715 Union Street, Redmond', items: 'Gravel · 8 cubic yd', driver: 'Alex Morgan', initials: 'AM', time: '11:45 AM', status: 'Preparing', color: 'amber' },
];
const stock = [
  { name: 'Portland Cement', sku: 'MAT-00124', category: 'Building materials', qty: '1,240', unit: 'bags', trend: '+12%', tone: 'positive', level: 74 },
  { name: 'Steel Rebar · 12mm', sku: 'MAT-00087', category: 'Structural steel', qty: '8.6', unit: 'tons', trend: '+4%', tone: 'positive', level: 52 },
  { name: 'Pine Lumber · 2×4', sku: 'MAT-00156', category: 'Lumber', qty: '320', unit: 'pieces', trend: 'Low stock', tone: 'warning', level: 23 },
  { name: 'Crushed Gravel', sku: 'MAT-00042', category: 'Aggregates', qty: '46', unit: 'cubic yd', trend: '−8%', tone: 'negative', level: 41 },
];

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

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await logout(); setUser(null); setEmail(''); setMenuOpen(false); setCompleted(false); }
    catch { announce('Unable to sign out. Please try again.'); }
    finally { setSigningOut(false); }
  };
  if (restoring) return <main className={`login-page ${theme === 'dark' ? 'theme-dark' : ''}`}><p role="status">Restoring your session...</p></main>;
  if (!user) return <LoginPage onSignIn={signIn} sessionError={sessionError} email={email} setEmail={setEmail} theme={theme} toggleTheme={toggleTheme}/>;

  return <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark">q<span>.</span></div><div className="brand-copy"><strong>qorvenz</strong><small>SUPPLY CHAIN</small></div><button className="mobile-close icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu"><Icon name="close"/></button></div>
      <div className="org-switch"><div className="org-icon">Q</div><div className="org-copy"><strong>Qorvenz Construction</strong><small>Enterprise workspace</small></div><span className="chevron">⌄</span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">{availableNavItems.map((item) => <button key={item.label} className={`nav-item ${activePage === item.label ? 'selected' : ''}`} onClick={() => { setActivePage(item.label); setSitesProjectId(''); setMenuOpen(false); }}><Icon name={item.icon}/><span>{item.label}</span>{item.label === 'Deliveries' && <span className="nav-count">8</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✦</div><strong>Need a hand?</strong><p>Visit our help center for tips and support.</p><button onClick={() => announce('Help center is coming soon')}>Visit help center <Icon name="arrow" size={14}/></button></div><button className="profile" onClick={signOut} disabled={signingOut} title="Sign out"><div className="avatar profile-avatar">{profile.initials}</div><div className="profile-copy"><strong>{profile.name}</strong><small>{role} · Sign out</small></div><Icon name="logout"/></button></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Icon name="menu"/></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activePage}</strong></div><div className="top-actions"><span className="role-badge">{role}</span><button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={17}/></button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => announce('You’re all caught up')}><Icon name="bell"/><i/></button><div className="top-avatar">{profile.initials}</div></div></header>
      <div className="page-wrap">
        {activePage === 'Overview' ? <>
          <div className="page-heading"><div><div className="eyebrow">{isDriver ? 'YOUR SHIFT · WEDNESDAY, NOVEMBER 5' : 'WEDNESDAY, NOVEMBER 5, 2026'}</div><h1>Good morning, {profile.name.split(' ')[0]} <span className="wave">✳</span></h1><p>{isDriver ? 'Here’s your route and delivery schedule for today.' : isWarehouse ? 'Here’s what’s happening across your warehouse today.' : 'Here’s what’s happening across your supply chain today.'}</p></div><button className="button button-primary" onClick={() => announce(isDriver ? 'Route updated' : 'New delivery form is ready')}><Icon name={isDriver ? 'route' : 'plus'} size={17}/>{isDriver ? 'View my route' : 'New delivery'}</button></div>
          {isDriver ? <DriverDashboard completed={completed} setCompleted={setCompleted} announce={announce}/> : <>
            <section className="metrics-grid" aria-label="Key metrics">
              <Metric title={isWarehouse ? 'Items in stock' : 'Total inventory value'} value={isWarehouse ? '12,486' : '$284,560'} detail={isWarehouse ? 'Across 248 unique materials' : '+8.2%'} note={isWarehouse ? 'active SKUs in this warehouse' : 'vs. last month'} icon="box" accent="lavender" chart="inventory"/>
              <Metric title="Active deliveries" value={isWarehouse ? '12' : '24'} detail="6" note="on the road right now" icon="truck" accent="peach" chart="delivery"/>
              <Metric title={isWarehouse ? 'Low stock alerts' : 'Active suppliers'} value={isWarehouse ? '8' : '38'} detail={isWarehouse ? '3 urgent' : '+4'} note={isWarehouse ? 'items need your attention' : 'new this month'} icon="users" accent="mint" chart="suppliers"/>
              <Metric title={isWarehouse ? 'Fulfillment rate' : 'On-time delivery'} value={isWarehouse ? '96.8%' : '98.2%'} detail="+2.4%" note="vs. last month" icon="chart" accent="blue" chart="ontime"/>
            </section>
            <section className="content-grid"><div className="panel delivery-panel"><div className="panel-heading"><div><h2>{isWarehouse ? 'Outbound deliveries' : 'Recent deliveries'}</h2><p>{isWarehouse ? 'Orders leaving your warehouse today' : 'Track and manage your latest orders'}</p></div><button className="text-button" onClick={() => setActivePage('Deliveries')}>View all <Icon name="arrow" size={15}/></button></div>
              <div className="table-tools"><label className="search-box"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search deliveries..." aria-label="Search deliveries"/><kbd>⌘ K</kbd></label><label className="filter-select"><Icon name="filter" size={15}/><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by status"><option>All status</option><option>Preparing</option><option>In transit</option><option>Delivered</option></select></label></div>
              <div className="table-scroll"><table><thead><tr><th>DELIVERY</th><th>DESTINATION</th><th>DRIVER</th><th>EST. TIME</th><th>STATUS</th><th></th></tr></thead><tbody>{visibleDeliveries.map((delivery) => <tr key={delivery.id}><td><strong className="delivery-id">{delivery.id}</strong><small>{delivery.items}</small></td><td><strong>{delivery.destination}</strong><small>{delivery.address}</small></td><td><div className="driver-cell"><span className="avatar">{delivery.initials}</span><span>{delivery.driver}</span></div></td><td>{delivery.time}</td><td><span className={`status status-${delivery.color}`}><i/>{delivery.status}</span></td><td><button className="icon-button row-more" aria-label={`More options for ${delivery.id}`} onClick={() => announce(`Delivery ${delivery.id}`)}><Icon name="more"/></button></td></tr>)}</tbody></table>{visibleDeliveries.length === 0 && <div className="empty-state">No deliveries match your search.</div>}</div>
              <div className="table-footer"><span>Showing <strong>{visibleDeliveries.length}</strong> of <strong>24</strong> deliveries</span><div><button aria-label="Previous page" disabled>‹</button><button className="current-page">1</button><button onClick={() => announce('Page 2 of deliveries')}>2</button><button onClick={() => announce('Page 3 of deliveries')}>3</button><span>…</span><button onClick={() => announce('Last page of deliveries')}>8</button><button aria-label="Next page" onClick={() => announce('Next delivery page')}>›</button></div></div>
            </div><div className="right-column"><StockPanel isWarehouse={isWarehouse} announce={announce}/><ActivityPanel/></div></section>
          </>}
        </> : activePage === 'Projects' ? <ProjectsPage onViewSites={(projectId) => { setSitesProjectId(projectId); setActivePage('Sites'); }}/>
        : activePage === 'Sites' ? <SitesPage key={sitesProjectId} initialProjectId={sitesProjectId}/>
        : <OtherPage page={activePage} role={role} query={query} setQuery={setQuery} announce={announce}/>}
        <footer className="page-footer"><span>© 2026 Qorvenz Technologies</span><span><i className="online-dot"/> All systems operational <span className="footer-sep">·</span> v1.0.0</span></footer>
      </div>
    </main>
    {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={15}/></span>{notice}</div>}
  </div>;
}

function LoginPage({ onSignIn, sessionError, email, setEmail, theme, toggleTheme }: { onSignIn: (user: AuthUser) => void; sessionError: string; email: string; setEmail: (value: string) => void; theme: 'light' | 'dark'; toggleTheme: () => void }) {
  const [signupMode, setSignupMode] = useState(false);
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
  if (signupMode) return <SignupPage onSignIn={onSignIn} theme={theme} toggleTheme={toggleTheme} onBackToLogin={() => setSignupMode(false)}/>;
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
        <span className="live-status-pill"><i className="online-dot" /> All systems normal</span>
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
        <button type="button" className="auth-switch" onClick={() => setSignupMode(true)}>
          New to Qorvenz? <strong>Create an account</strong>
        </button>
      </div>

      <div className="auth-features-strip" aria-hidden="true">
        <div className="auth-feature-chip"><Icon name="truck" size={14} /> Real-time Fleet Telemetry</div>
        <div className="auth-feature-chip"><Icon name="box" size={14} /> Automated Stock Balancing</div>
        <div className="auth-feature-chip"><Icon name="chart" size={14} /> Predictive Delivery ETAs</div>
      </div>
    </div>

    <footer className="auth-footer">
      <span>Built for the teams that build the modern world</span>
      <span>© 2026 Qorvenz Technologies Inc.</span>
    </footer>
  </main>;
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
        <span className="live-status-pill"><i className="online-dot" /> All systems normal</span>
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
            <Icon name="users" size={20} />
          </div>
          <span className="eyebrow">GET STARTED</span>
        </div>
        <div className="login-heading">
          <h2>Create your workspace account</h2>
          <p>Join your operations team and start managing supply chain flow.</p>
        </div>
        <form className="login-form" noValidate onSubmit={submit} aria-busy={loading}>
          <label className="login-label" htmlFor="signup-name">Full name</label>
          <div className="login-input-wrap">
            <input
              id="signup-name"
              disabled={loading}
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Alex Morgan"
            />
          </div>
          <label className="login-label" htmlFor="signup-email">Work email</label>
          <div className="login-input-wrap">
            <span className="input-symbol">@</span>
            <input
              id="signup-email"
              disabled={loading}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="alex@company.com"
            />
          </div>
          <label className="login-label" htmlFor="signup-password">Password</label>
          <div className="login-input-wrap">
            <input
              id="signup-password"
              disabled={loading}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Creating account...' : <>Create account<Icon name="arrow" size={16} /></>}
          </button>
        </form>
        <div className="login-note">
          <Icon name="check" size={14} />
          <span>New accounts start with Driver & Fleet Dispatch access</span>
        </div>
        <button type="button" className="auth-switch" onClick={onBackToLogin}>
          Already have an account? <strong>Sign in</strong>
        </button>
      </div>
    </div>

    <footer className="auth-footer">
      <span>Built for the teams that build the modern world</span>
      <span>© 2026 Qorvenz Technologies Inc.</span>
    </footer>
  </main>;
}

function Metric({ title, value, detail, note, icon, accent, chart }: { title: string; value: string; detail: string; note: string; icon: IconName; accent: string; chart: string }) {
  const lines: Record<string, string> = { inventory: '0,26 14,19 27,22 40,10 52,14 65,5 78,9 92,0', delivery: '0,21 14,25 27,13 40,18 52,8 65,14 78,4 92,8', suppliers: '0,18 14,22 27,13 40,17 52,7 65,12 78,1 92,5', ontime: '0,24 14,17 27,19 40,12 52,15 65,5 78,10 92,0' };
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${accent}`}><Icon name={icon} size={17}/></span></div><div className="metric-value">{value}</div><div className="metric-bottom"><div><span className={`metric-change ${detail.startsWith('−') ? 'negative' : /urgent/i.test(detail) ? 'warning' : ''}`}>{detail}</span><span className="metric-note"> {note}</span></div><svg className="sparkline" viewBox="0 0 92 30" preserveAspectRatio="none"><polyline points={lines[chart]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div></article>;
}

function StockPanel({ isWarehouse, announce }: { isWarehouse: boolean; announce: (message: string) => void }) {
  return <section className="panel stock-panel"><div className="panel-heading"><div><h2>{isWarehouse ? 'Stock levels' : 'Inventory overview'}</h2><p>{isWarehouse ? 'Current levels at your warehouse' : 'Your top moving materials'}</p></div><button className="icon-button row-more" aria-label="Inventory options" onClick={() => announce('Inventory options')}><Icon name="more"/></button></div><div className="stock-list">{stock.map((item) => <div className="stock-row" key={item.sku}><div className="material-icon"><Icon name="package" size={17}/></div><div className="stock-info"><div className="stock-title"><strong>{item.name}</strong><span className={`stock-trend ${item.tone}`}>{item.trend}</span></div><small>{item.sku} <i>·</i> {item.category}</small><div className="stock-bar"><span style={{ width: `${item.level}%` }}/></div></div><div className="stock-amount"><strong>{item.qty}</strong><small>{item.unit}</small></div></div>)}</div><button className="stock-link" onClick={() => announce('Opening full inventory')}>View all inventory <Icon name="arrow" size={15}/></button></section>;
}

function ActivityPanel() {
  const events = [{ icon: 'truck' as const, tone: 'peach', text: <><strong>Delivery completed</strong><span> · DLV-2043 delivered to Westlake Site</span></>, time: '12 min ago' }, { icon: 'box' as const, tone: 'lavender', text: <><strong>Stock updated</strong><span> · 120 bags of cement received</span></>, time: '38 min ago' }, { icon: 'users' as const, tone: 'mint', text: <><strong>New supplier added</strong><span> · Pacific Building Materials</span></>, time: '1 hour ago' }];
  return <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest updates from your team</p></div><button className="icon-button row-more" aria-label="Activity options"><Icon name="more"/></button></div><div className="activity-list">{events.map((event, index) => <div className="activity-item" key={event.time}><span className={`activity-icon ${event.tone}`}><Icon name={event.icon} size={15}/></span><div><p>{event.text}</p><small>{event.time}</small></div>{index < events.length - 1 && <span className="activity-line"/>}</div>)}</div><button className="stock-link">View activity log <Icon name="arrow" size={15}/></button></section>;
}

function DriverDashboard({ completed, setCompleted, announce }: { completed: boolean; setCompleted: (next: boolean) => void; announce: (message: string) => void }) {
  return <><section className="driver-summary"><div className="driver-summary-title"><span className="route-icon"><Icon name="route" size={19}/></span><div><strong>Today’s route</strong><small>Route 04 · Seattle North</small></div><span className="route-status"><i/> ON SCHEDULE</span></div><div className="route-stats"><div><strong>4</strong><small>Stops</small></div><div><strong>28 <small>mi</small></strong><small>Total distance</small></div><div><strong>6h 20m</strong><small>Estimated duration</small></div><button className="button button-outline" onClick={() => announce('Route details opened')}><Icon name="pin" size={16}/> Open route</button></div></section><section className="panel route-panel"><div className="panel-heading"><div><h2>Delivery stops</h2><p>Your scheduled deliveries for today</p></div><span className="stop-count">{completed ? '1' : '0'} of 4 completed</span></div><div className="route-stop-list">{deliveries.map((stop, index) => <div className={`route-stop ${completed && index === 0 ? 'stop-done' : ''}`} key={stop.id}><div className="stop-marker-wrap"><span className={`stop-marker ${completed && index === 0 ? 'done' : index === 0 ? 'current' : ''}`}>{completed && index === 0 ? <Icon name="check" size={15}/> : String(index + 1).padStart(2, '0')}</span>{index < deliveries.length - 1 && <span className="stop-connector"/>}</div><div className="stop-body"><div className="stop-top"><div><span className="stop-time"><Icon name="clock" size={14}/>{stop.time}</span><h3>{stop.destination}</h3><p><Icon name="pin" size={14}/>{stop.address}</p></div><span className={`status status-${completed && index === 0 ? 'green' : stop.color}`}><i/>{completed && index === 0 ? 'Delivered' : index === 0 ? 'Next stop' : stop.status}</span></div><div className="stop-detail"><span className="stop-material"><Icon name="package" size={15}/>{stop.items}</span><span className="stop-id">{stop.id}</span><button className="text-button" onClick={() => announce(`Details for ${stop.id}`)}>Details <Icon name="arrow" size={14}/></button></div>{index === 0 && !completed && <button className="button button-primary mark-button" onClick={() => { setCompleted(true); announce('Delivery marked complete'); }}><Icon name="check" size={16}/> Mark as delivered</button>}</div></div>)}</div></section></>;
}

function OtherPage({ page, role, query, setQuery, announce }: { page: string; role: Role; query: string; setQuery: (value: string) => void; announce: (message: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const headings: Record<string, string> = { Inventory: role === 'Warehouse manager' ? 'Warehouse inventory' : 'Inventory', Deliveries: 'Delivery management', Team: 'Team members', Analytics: 'Supply chain analytics', Settings: 'Workspace settings' };
  const descriptions: Record<string, string> = { Inventory: 'Monitor stock, manage materials, and keep your warehouse moving.', Deliveries: 'Track orders from warehouse to job site.', Team: 'Manage the people who keep operations running.', Analytics: 'A clear view of performance across your operation.', Settings: 'Manage your workspace preferences and access.' };
  const people = [
    { name: 'Jordan Miller', role: 'Administrator', status: 'Active', initials: 'JM' },
    { name: 'Priya Shah', role: 'Warehouse manager', status: 'Active', initials: 'PS' },
    { name: 'Marcus Chen', role: 'Driver', status: 'On route', initials: 'MC' },
    { name: 'Sarah Johnson', role: 'Driver', status: 'Active', initials: 'SJ' },
  ].filter((person) => `${person.name} ${person.role}`.toLowerCase().includes(query.toLowerCase()));
  const filteredStock = stock.filter((item) => `${item.name} ${item.sku}`.toLowerCase().includes(query.toLowerCase()));
  const filteredDeliveries = deliveries.filter((item) => `${item.id} ${item.destination}`.toLowerCase().includes(query.toLowerCase()));
  let rows: React.ReactNode = null;
  if (page === 'Inventory') rows = filteredStock.map((item) => <tr key={item.sku}><td><strong>{item.name}</strong><small>{item.sku}</small></td><td>{item.category}</td><td>{item.qty} {item.unit}</td><td><span className={`status ${item.tone === 'warning' ? 'status-amber' : 'status-green'}`}><i/>{item.tone === 'warning' ? 'Low stock' : 'In stock'}</span></td></tr>);
  if (page === 'Team') rows = people.map((person) => <tr key={person.name}><td><div className="driver-cell"><span className="avatar">{person.initials}</span><strong>{person.name}</strong></div></td><td>{person.role}</td><td>{person.status}</td><td><span className="status status-green"><i/>Active</span></td></tr>);
  if (page === 'Deliveries') rows = filteredDeliveries.map((item) => <tr key={item.id}><td><strong>{item.id}</strong><small>{item.items}</small></td><td>{item.destination}</td><td>{item.driver}</td><td><span className={`status status-${item.color}`}><i/>{item.status}</span></td></tr>);
  const title = headings[page] ?? page;
  return <>
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE · {page.toUpperCase()}</div><h1>{title}</h1><p>{descriptions[page] ?? 'Manage your supply chain workspace.'}</p></div>{page !== 'Settings' && <button className="button button-primary" onClick={() => setShowForm(!showForm)}><Icon name="plus" size={17}/>{page === 'Team' ? 'Invite member' : page === 'Inventory' ? 'Add material' : 'New delivery'}</button>}</div>
    {showForm && <div className="inline-form panel"><strong>{page === 'Team' ? 'Invite a team member' : page === 'Inventory' ? 'Add a material' : 'Create a delivery'}</strong><p>This workspace action is ready to connect to your API.</p><button className="button button-primary" onClick={() => { setShowForm(false); announce('Saved successfully'); }}>Continue</button></div>}
    <div className="panel listing-panel"><div className="panel-heading"><div><h2>{page === 'Inventory' ? 'All materials' : page === 'Deliveries' ? 'All deliveries' : page === 'Team' ? 'Workspace team' : page === 'Analytics' ? 'Performance snapshot' : 'General'}</h2><p>{page === 'Analytics' ? 'Key indicators for the last 30 days' : 'Updated just now'}</p></div><label className="search-box listing-search"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${page.toLowerCase()}...`} aria-label={`Search ${page}`}/></label></div>
      {page === 'Settings' ? <div className="settings-list"><div><strong>Workspace profile</strong><span>Qorvenz Construction · Enterprise</span></div><div><strong>Default role</strong><span>{role}</span></div><div><strong>Notifications</strong><span>Delivery alerts and stock warnings enabled</span></div></div> : page === 'Analytics' ? <div className="analytics-cards"><div><span>Orders fulfilled</span><strong>1,284</strong><small className="positive">↑ 12.8% from previous month</small></div><div><span>Average delivery time</span><strong>2.4 days</strong><small className="positive">↓ 0.3 days from previous month</small></div><div><span>Stock turnover</span><strong>6.8×</strong><small className="positive">↑ 0.6× from previous month</small></div></div> : <div className="table-scroll"><table><thead><tr><th>{page === 'Inventory' ? 'MATERIAL' : page === 'Team' ? 'MEMBER' : 'DELIVERY'}</th><th>{page === 'Inventory' ? 'CATEGORY' : page === 'Team' ? 'ROLE' : 'DESTINATION'}</th><th>{page === 'Inventory' ? 'IN STOCK' : page === 'Team' ? 'STATUS' : 'DRIVER'}</th><th>STATUS</th></tr></thead><tbody>{rows}</tbody></table></div>}
    </div>
  </>;
}

export default App;
