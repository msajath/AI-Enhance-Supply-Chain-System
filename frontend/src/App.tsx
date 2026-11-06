import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import { apiClient } from './services/api';
import { logout, restoreSession, type AuthUser } from './services/auth';
import { read, write, errorMessage, emptyContext, type Context, type Row } from './services/management';
import LoginPage from './pages/Login';
import Icon from './components/Icon';
import { Brand } from './components/Brand';
import { SiteIllustration } from './components/SiteIllustration';
import { ManagedRoute, RolesPage, Modal, DataTable } from './pages/Management';
import { ProjectsPage } from './pages/Projects';
import { SitesPage } from './pages/Sites';
import { nav, resources, rolePrefix } from './pages/managementConfig';
import './management.css';

type Theme = 'light' | 'dark';
type IconName = Parameters<typeof Icon>[0]['name'];
type NavEntry = { path: string; label: string };

function greeting(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

const ICONS: Record<string, IconName> = {
  dashboard: 'grid', users: 'users', requests: 'bell', roles: 'check', projects: 'building', sites: 'pin', warehouses: 'package', audit: 'clock', settings: 'settings',
  vehicles: 'truck', drivers: 'users', assignments: 'route', equipment: 'package', maintenance: 'settings', fuel: 'chart', reports: 'chart',
  inventory: 'box', materials: 'package', receipts: 'truck', issues: 'arrow', transfers: 'route', counts: 'check', adjustments: 'filter', returns: 'more', movements: 'clock',
};
const iconFor = (path: string): IconName => ICONS[path.split('/').pop() ?? ''] ?? 'grid';

/** Read-only Sprint 1 pages (AESCS-162 / 163) added to the warehouse workspace. */
const SPRINT1_PAGES: Record<string, NavEntry[]> = {
  warehouse: [{ path: '/warehouse/projects', label: 'Projects' }, { path: '/warehouse/sites', label: 'Sites' }],
};
function navFor(prefix: string): NavEntry[] {
  const items = nav[prefix];
  return [items[0], ...(SPRINT1_PAGES[prefix] ?? []), ...items.slice(1)];
}

const INTRO: Record<string, string> = {
  admin: 'This is what is happening across your organization today.',
  fleet: 'Your vehicles, drivers and service work at a glance.',
  warehouse: 'This is what is moving through your warehouses today.',
  driver: 'Here are the trips your fleet manager has assigned to you.',
};

function Dashboard({ prefix, user }: { prefix: string; user: AuthUser }) {
  const [data, setData] = useState<{ cards: { label: string; value: unknown }[]; activity: Row[]; alerts: Row[] } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setData(null); setError('');
    read<typeof data>(prefix + '/dashboard').then((d) => { if (active) setData(d); }).catch((e) => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [prefix, revision]);
  const columns = (rows: Row[]) => rows[0] ? Object.keys(rows[0]).filter((k) => k !== 'id') : [];
  const firstTask = nav[prefix][1];
  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="hero-date">{today()}</p>
        <h1>{greeting()}, {user.full_name.split(' ')[0]}</h1>
        <p>{INTRO[prefix]}{prefix !== 'driver' && ' Figures reflect only the projects and warehouses you can access.'}</p>
        <div className="hero-actions">
          {firstTask && <Link className="button button-primary" to={firstTask.path}><Icon name={iconFor(firstTask.path)} size={17}/>{firstTask.label}</Link>}
          <button type="button" className="button button-ghost" onClick={() => setRevision((v) => v + 1)}>Refresh</button>
        </div>
      </div>
      <SiteIllustration className="compact"/>
    </section>
    {error ? <div role="alert" className="manage-error">{error}</div> : !data ? <p className="org-state" role="status">Loading overview...</p> : <>
      {data.cards.length > 0 && <section className="figures" aria-label="Key figures" style={{ '--cols': Math.min(data.cards.length, 4) } as React.CSSProperties}>
        {data.cards.map((card) => <div className="figure" key={card.label}><span className="figure-title">{card.label}</span><strong className="figure-value">{String(card.value)}</strong><span className="figure-note">Live from the database</span></div>)}
      </section>}
      <section className="overview-grid">
        <div className="panel"><div className="panel-heading"><div><h2>{prefix === 'driver' ? 'Upcoming trips' : 'Recent activity'}</h2><p>{prefix === 'driver' ? 'Your next scheduled trips' : 'The latest changes in your workspace'}</p></div></div><DataTable rows={data.activity} columns={columns(data.activity)}/></div>
        <div className="panel"><div className="panel-heading"><div><h2>{prefix === 'admin' ? 'Team by role' : prefix === 'driver' ? 'Notices' : 'Needs attention'}</h2><p>{prefix === 'fleet' ? 'Upcoming service and restricted assets' : prefix === 'warehouse' ? 'Quarantined stock' : prefix === 'driver' ? 'Licence and account reminders' : 'Active accounts per role'}</p></div></div><DataTable rows={data.alerts} columns={columns(data.alerts)}/></div>
      </section>
      <section className="panel quick-links"><div className="panel-heading"><div><h2>Continue your work</h2></div></div>
        <div className="quick-links-row">{navFor(prefix).slice(1, 6).map((item) => <Link className="button button-outline" key={item.path} to={item.path}><Icon name={iconFor(item.path)} size={16}/>{item.label}</Link>)}</div>
      </section>
    </>}
  </>;
}

function Shell({ user, theme, toggleTheme, onLogout, onExpired }: { user: AuthUser; theme: Theme; toggleTheme: () => void; onLogout: () => Promise<void>; onExpired: () => void }) {
  const prefix = rolePrefix(user.role);
  const location = useLocation();
  const navigate = useNavigate();
  const key = location.pathname.slice(1);
  const items = navFor(prefix);
  const activeIndex = items.findIndex((i) => i.path === location.pathname);
  const item = items[activeIndex];
  const [context, setContext] = useState<Context>(emptyContext);
  const [contextError, setContextError] = useState('');
  const [revision, setRevision] = useState(0);
  const [scope, setScope] = useState('');
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    read<Context>('context').then((c) => { if (active) { setContext(c); setContextError(''); } }).catch((e) => { if (active) setContextError(errorMessage(e)); });
    return () => { active = false; };
  }, [revision, user.id]);
  useEffect(() => { setMenu(false); }, [location.pathname]);
  // Admins see how many access requests are waiting, refreshed every 30 s and on every page change.
  const [pendingRequests, setPendingRequests] = useState(0);
  useEffect(() => {
    if (prefix !== 'admin') return;
    let active = true;
    const load = () => read<{ rows: Row[] }>('admin/access-requests')
      .then((d) => { if (active) setPendingRequests(d.rows.filter((r) => r.status === 'PENDING').length); })
      .catch(() => { /* the badge is optional; the page itself shows any error */ });
    load();
    const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [prefix, location.pathname, revision]);
  const initials = user.full_name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  const signOut = async () => { if (busy) return; setBusy(true); setError(''); try { await onLogout(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const scopes = prefix === 'warehouse' ? context.warehouses : context.projects;
  const accountSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      await write('account', { full_name: String(form.get('full_name')), current_password: String(form.get('current_password')), ...(form.get('new_password') ? { new_password: String(form.get('new_password')) } : {}) }, 'patch');
      onExpired();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const themeLabel = `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`;
  const sitesProject = (location.state as { projectId?: string } | null)?.projectId ?? '';

  let page;
  if (key === prefix + '/dashboard') page = <Dashboard prefix={prefix} user={user}/>;
  else if (key === 'admin/roles') page = <RolesPage/>;
  else if (key === 'warehouse/projects') page = <ProjectsPage onViewSites={(projectId) => navigate('/warehouse/sites', { state: { projectId } })}/>;
  else if (key === 'warehouse/sites') page = <SitesPage key={sitesProject} initialProjectId={sitesProject}/>;
  else if (resources[key]) page = <ManagedRoute path={key} context={context} onChanged={() => setRevision((v) => v + 1)} scope={scope}/>;
  else page = <div className="org-state"><div><strong>Page not found</strong><p><Link to={'/' + prefix + '/dashboard'}>Return to overview</Link></p></div></div>;

  return <div className={`app-shell management-app ${theme === 'dark' ? 'theme-dark' : ''}`}>
    <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top">
        <Brand/>
        <button className="mobile-close icon-button" aria-label="Close menu" onClick={() => setMenu(false)}><Icon name="close"/></button>
      </div>
      <p className="org-name">{String(context.organization.name ?? 'Your organization')}<small>{user.role} workspace</small></p>
      <nav className="main-nav" aria-label="Main navigation">
        {activeIndex >= 0 && <span className="nav-indicator" aria-hidden="true" style={{ transform: `translateY(${activeIndex * 42}px)` }}/>}
        {items.map((entry) => <NavLink key={entry.path} to={entry.path} className={({ isActive }: { isActive: boolean }) => 'nav-item ' + (isActive ? 'selected' : '')}><Icon name={iconFor(entry.path)}/><span>{entry.label}</span>{entry.path === '/admin/requests' && pendingRequests > 0 && <b className="nav-count" aria-label={`${pendingRequests} waiting`}>{pendingRequests}</b>}</NavLink>)}
      </nav>
      <div className="sidebar-foot">
        <button className="profile" title="Account settings" onClick={() => { setError(''); setProfile(true); }}>
          <span className="avatar">{initials}</span>
          <span className="profile-copy"><strong>{user.full_name}</strong><small>{user.email}</small></span>
        </button>
        <button className="icon-button sign-out" title="Sign out" aria-label="Sign out" disabled={busy} onClick={signOut}><Icon name="logout"/></button>
      </div>
    </aside>
    {menu && <button className="scrim" aria-label="Close navigation" onClick={() => setMenu(false)}/>}
    <main className="main-content">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setMenu(true)}><Icon name="menu"/></button>
        <span className="topbar-crumbs"><span>{user.role}</span><strong>{item?.label ?? 'Page'}</strong></span>
        <div className="top-actions">
          {prefix !== 'driver' && <label className="filter-select scope-select"><Icon name="filter" size={15}/><span className="visually-hidden">{prefix === 'warehouse' ? 'Warehouse' : 'Project'}</span>
            <select aria-label="Project or warehouse filter" value={scope} onChange={(e) => setScope(e.target.value)}><option value="">All my {prefix === 'warehouse' ? 'warehouses' : 'projects'}</option>{scopes.map((s) => <option key={s.id} value={s.id}>{String(s.name)}</option>)}</select>
          </label>}
          <span className="role-badge">{user.role}</span>
          <button className="icon-button theme-toggle" aria-label={themeLabel} title={themeLabel} onClick={toggleTheme}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={17}/></button>
        </div>
      </header>
      <div className="page-wrap" key={location.pathname}>
        {contextError && <div className="manage-error" role="alert">{contextError}<button onClick={() => setRevision((v) => v + 1)}>Retry</button></div>}
        {error && !profile && <div className="manage-error" role="alert">{error}</div>}
        {page}
        <footer className="page-footer"><span>© {new Date().getFullYear()} Qorvenz Technologies</span><span>Scoped access · Audited operations</span></footer>
      </div>
    </main>
    {profile && <Modal title="Account settings" onClose={() => { if (!busy) setProfile(false); }}>
      <p className="manage-help">{user.email} · {user.role}. Saving changes signs you out of every device.</p>
      <form onSubmit={accountSave}>
        <label className="manage-field">Full name<input name="full_name" required defaultValue={user.full_name}/></label>
        <label className="manage-field">Current password<input name="current_password" type="password" required autoComplete="current-password"/></label>
        <label className="manage-field">New password (optional)<input name="new_password" type="password" minLength={12} maxLength={72} autoComplete="new-password"/></label>
        {error && <p className="manage-error" role="alert">{error}</p>}
        <div className="dialog-footer"><button className="button button-primary" disabled={busy}>{busy ? 'Saving...' : 'Save account'}</button></div>
      </form>
    </Modal>}
  </div>;
}

function Application() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [email, setEmail] = useState('');
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem('qorvenz-theme') === 'dark' ? 'dark' : 'light');
  const toggleTheme = () => setTheme((t) => { const next = t === 'light' ? 'dark' : 'light'; localStorage.setItem('qorvenz-theme', next); return next; });
  const expire = () => { setUser(null); setSessionError('Your session has expired. Please sign in again.'); };
  useEffect(() => {
    let active = true;
    restoreSession().then((u) => { if (active) setUser(u); }).catch(() => { if (active) setSessionError('Unable to restore your session. Please sign in again.'); }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const id = apiClient.interceptors.response.use((r) => r, (e) => { if (e.response?.status === 401 && !String(e.config?.url).includes('/auth/')) expire(); return Promise.reject(e); });
    return () => apiClient.interceptors.response.eject(id);
  }, []);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const check = () => { restoreSession().then((u) => { if (!u) expire(); else setUser(u); }).catch(() => { /* keep data visible during a temporary connection failure */ }); };
    const timer = window.setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, [userId]);
  const signIn = (u: AuthUser) => { setSessionError(''); setUser(u); };
  const onLogout = async () => { await logout(); setUser(null); setEmail(''); };
  if (restoring) return <main className={`login-page restoring ${theme === 'dark' ? 'theme-dark' : ''}`}><p role="status">Restoring your session...</p></main>;
  const home = user ? '/' + rolePrefix(user.role) + '/dashboard' : '/login';
  const protectedRole = (role: AuthUser['role']) => !user ? <Navigate to="/login" replace/>
    : user.role !== role ? <main className={`access-denied ${theme === 'dark' ? 'theme-dark' : ''}`}><Brand/><h1>Access denied</h1><p>Your account is not authorized for this workspace.</p><Link className="button button-primary" to={home}>Return to your dashboard</Link></main>
    : <Shell user={user} theme={theme} toggleTheme={toggleTheme} onLogout={onLogout} onExpired={expire}/>;
  return <Routes>
    <Route path="/login" element={user ? <Navigate to={home} replace/> : <LoginPage onSignIn={signIn} sessionError={sessionError} email={email} setEmail={setEmail} theme={theme} toggleTheme={toggleTheme}/>}/>
    <Route path="/admin/*" element={protectedRole('Admin')}/>
    <Route path="/fleet/*" element={protectedRole('Fleet manager')}/>
    <Route path="/warehouse/*" element={protectedRole('Warehouse manager')}/>
    <Route path="/driver/*" element={protectedRole('Driver')}/>
    <Route path="*" element={<Navigate to={home} replace/>}/>
  </Routes>;
}

export default function App() {
  return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Application/></BrowserRouter>;
}
