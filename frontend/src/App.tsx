import {useEffect,useState} from 'react';
import {BrowserRouter,Routes,Route,Navigate,NavLink,useLocation,Link} from 'react-router-dom';
import {apiClient} from './services/api';
import {logout,restoreSession,type AuthUser} from './services/auth';
import {read,write,errorMessage,emptyContext,type Context,type Row} from './services/management';
import LoginPage from './pages/Login';
import Icon from './components/Icon';
import {ManagedRoute,RolesPage,Modal,DataTable} from './pages/Management';
import {nav,resources,rolePrefix} from './pages/managementConfig';
import './management.css';
type Theme='light'|'dark';
function Dashboard({prefix,user}:{prefix:string;user:AuthUser}) {
 const [data,setData]=useState<{cards:{label:string;value:unknown}[];activity:Row[];alerts:Row[]}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setData(null);setError('');read<typeof data>(prefix+'/dashboard').then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;};},[prefix,revision]);
 const activityColumns=data?.activity[0]?Object.keys(data.activity[0]).filter(k=>k!=='id'):[];
 const alertColumns=data?.alerts[0]?Object.keys(data.alerts[0]).filter(k=>k!=='id'):[];
 return <><div className="page-heading"><div><div className="eyebrow">{user.role.toUpperCase()} &bull; {new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div><h1>Good morning, {user.full_name.split(' ')[0]}</h1><p>Your {prefix==='admin'?'administration':prefix==='fleet'?'fleet and maintenance':'warehouse and inventory'} overview. Figures reflect your authorized scope.</p></div><button className="button button-outline" onClick={()=>setRevision(v=>v+1)}>Refresh overview</button></div>
  {error?<div role="alert" className="manage-error">{error}</div>:!data?<p role="status">Loading overview...</p>:<>
   <section className="metrics-grid" aria-label="Key metrics">{data.cards.map((c,i)=><article className="metric-card" key={c.label}><div className="metric-top"><span>{c.label}</span><span className={'metric-icon '+['lavender','mint','peach','blue'][i]}><Icon name={i===0?'grid':i===1?'box':i===2?'truck':'clock'}/></span></div><div className="metric-value">{String(c.value)}</div><p className="metric-note">Verified database records</p></article>)}</section>
   <div className="manage-overview-grid"><section className="panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>The latest changes in your workspace</p></div></div><DataTable rows={data.activity} columns={activityColumns}/></section><section className="panel"><div className="panel-heading"><div><h2>{prefix==='admin'?'Active role distribution':'Attention & alerts'}</h2><p>{prefix==='fleet'?'Upcoming service and restricted assets':prefix==='warehouse'?'Quarantined stock requiring attention':'Account distribution across the supported roles'}</p></div></div><DataTable rows={data.alerts} columns={alertColumns}/></section></div>
   <section className="panel manage-quick"><h2>Continue your work</h2><div>{nav[prefix].slice(1,5).map(item=><Link className="button button-outline" key={item.path} to={item.path}>{item.label} <Icon name="arrow" size={14}/></Link>)}</div></section>
  </>}
 </>;
}
function Shell({user,theme,toggleTheme,onLogout,onExpired}:{user:AuthUser;theme:Theme;toggleTheme:()=>void;onLogout:()=>Promise<void>;onExpired:()=>void}) {
 const prefix=rolePrefix(user.role),location=useLocation(),key=location.pathname.slice(1),item=nav[prefix].find(i=>i.path===location.pathname);
 const [context,setContext]=useState<Context>(emptyContext),[contextError,setContextError]=useState(''),[revision,setRevision]=useState(0),[scope,setScope]=useState(''),[menu,setMenu]=useState(false),[profile,setProfile]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;read<Context>('context').then(c=>{if(active){setContext(c);setContextError('');}}).catch(e=>{if(active)setContextError(errorMessage(e));});return()=>{active=false;};},[revision,user.id]);
 useEffect(()=>{setMenu(false);},[location.pathname]);
 const initials=user.full_name.split(' ').map(p=>p[0]).join('').slice(0,2);
 const signOut=async()=>{if(busy)return;setBusy(true);setError('');try{await onLogout();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
 const scopes=prefix==='warehouse'?context.warehouses:context.projects;
 const accountSave=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget);setBusy(true);setError('');try{
  await write('account',{full_name:String(form.get('full_name')),current_password:String(form.get('current_password')),...(form.get('new_password')?{new_password:String(form.get('new_password'))}:{})},'patch');onExpired();
 }catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
 return <div className={'app-shell management-app '+(theme==='dark'?'theme-dark':'')}>
  <aside className={'sidebar '+(menu?'sidebar-open':'')}><div className="brand"><div className="brand-mark">q<span>.</span></div><div className="brand-copy"><strong>qorvenz</strong><small>SUPPLY CHAIN</small></div><button className="mobile-close icon-button" aria-label="Close menu" onClick={()=>setMenu(false)}>&bull;</button></div>
   <div className="org-switch"><div className="org-icon">Q</div><div className="org-copy"><strong>{String(context.organization.name??'Your organization')}</strong><small>{user.role} workspace</small></div></div><div className="nav-label">WORKSPACE</div>
   <nav className="main-nav" aria-label="Main navigation">{nav[prefix].map((entry,i)=><NavLink key={entry.path} to={entry.path} className={({isActive})=>'nav-item '+(isActive?'selected':'')}><Icon name={i===0?'grid':prefix==='fleet'?'truck':prefix==='warehouse'?'box':'building'}/><span>{entry.label}</span></NavLink>)}</nav>
   <div className="sidebar-bottom"><button className="profile" title="Account settings" onClick={()=>{setError('');setProfile(true);}}><span className="avatar profile-avatar">{initials}</span><span className="profile-copy"><strong>{user.full_name}</strong><small>{user.email}</small></span><Icon name="settings"/></button><button className="nav-item" title="Sign out" disabled={busy} onClick={signOut}><Icon name="logout"/>{busy?'Signing out...':'Sign out'}</button></div>
  </aside>{menu&&<button className="scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
  <main className="main-content"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open menu" onClick={()=>setMenu(true)}><Icon name="menu"/></button><div className="breadcrumbs"><span>{user.role}</span><span>/</span><strong>{item?.label??'Page'}</strong></div><div className="top-actions"><label className="scope-selector"><span>{prefix==='warehouse'?'Warehouse':'Project'}</span><select aria-label="Project or warehouse filter" value={scope} onChange={e=>setScope(e.target.value)}><option value="">All authorized locations</option>{scopes.map(s=><option key={s.id} value={s.id}>{String(s.name)}</option>)}</select></label><button className="icon-button theme-toggle" aria-label={'Switch to '+(theme==='light'?'dark':'light')+' theme'} onClick={toggleTheme}><Icon name={theme==='light'?'moon':'sun'}/></button></div></header>
   <div className="page-wrap">{contextError&&<div className="manage-error" role="alert">{contextError}<button onClick={()=>setRevision(v=>v+1)}>Retry context</button></div>}{error&&!profile&&<div className="manage-error" role="alert">{error}</div>}
    {key===prefix+'/dashboard'?<Dashboard prefix={prefix} user={user}/>:key==='admin/roles'?<RolesPage/>:resources[key]?<ManagedRoute path={key} context={context} onChanged={()=>setRevision(v=>v+1)} scope={scope}/>:<div className="org-state"><h1>Page not found</h1><Link to={'/'+prefix+'/dashboard'}>Return to overview</Link></div>}
    <footer className="page-footer"><span>&bull; {new Date().getFullYear()} Qorvenz Technologies</span><span>Scoped access &bull; Audited operations</span></footer>
   </div>
  </main>
  {profile&&<Modal title="Account settings" onClose={()=>{if(!busy)setProfile(false);}}><p className="manage-help">{user.email} &bull; {user.role}. Updating your account revokes existing sessions and requires sign-in.</p><form onSubmit={accountSave}><label className="manage-field">Full name<input name="full_name" required defaultValue={user.full_name}/></label><label className="manage-field">Current password<input name="current_password" type="password" required autoComplete="current-password"/></label><label className="manage-field">New password (optional)<input name="new_password" type="password" minLength={12} maxLength={72} autoComplete="new-password"/></label>{error&&<p className="manage-error" role="alert">{error}</p>}<div className="dialog-footer"><button className="button button-primary" disabled={busy}>{busy?'Saving...':'Save account'}</button></div></form></Modal>}
 </div>;
}
function Application() {
 const [user,setUser]=useState<AuthUser|null>(null),[restoring,setRestoring]=useState(true),[sessionError,setSessionError]=useState(''),[email,setEmail]=useState('');
 const [theme,setTheme]=useState<Theme>(()=>localStorage.getItem('qorvenz-theme')==='dark'?'dark':'light');
 const toggleTheme=()=>setTheme(t=>{const next=t==='light'?'dark':'light';localStorage.setItem('qorvenz-theme',next);return next;});
 const expire=()=>{setUser(null);setSessionError('Your session has expired. Please sign in again.');};
 useEffect(()=>{let active=true;restoreSession().then(u=>{if(active)setUser(u);}).catch(()=>{if(active)setSessionError('Unable to restore your session. Please sign in again.');}).finally(()=>{if(active)setRestoring(false);});return()=>{active=false;};},[]);
 useEffect(()=>{const id=apiClient.interceptors.response.use(r=>r,e=>{if(e.response?.status===401&&!String(e.config?.url).includes('/auth/'))expire();return Promise.reject(e);});return()=>apiClient.interceptors.response.eject(id);},[]);
 const userId=user?.id;
 useEffect(()=>{if(!userId)return;const check=()=>{restoreSession().then(u=>{if(!u)expire();else setUser(u);}).catch(()=>{/* Existing data remains visible during a temporary connection failure. */});};const timer=window.setInterval(check,60000);window.addEventListener('focus',check);return()=>{window.clearInterval(timer);window.removeEventListener('focus',check);};},[userId]);
 const signIn=(u:AuthUser)=>{setSessionError('');setUser(u);};
 const onLogout=async()=>{await logout();setUser(null);setEmail('');};
 if(restoring)return <main className="login-page"><p role="status">Restoring your session...</p></main>;
 const home=user?'/'+rolePrefix(user.role)+'/dashboard':'/login';
 const protectedRole=(role:AuthUser['role'])=>!user?<Navigate to="/login" replace/>:user.role!==role?<main className="access-denied"><h1>Access Denied</h1><p>Your account is not authorized for this workspace.</p><Link className="button button-primary" to={home}>Return to your dashboard</Link></main>:<Shell user={user} theme={theme} toggleTheme={toggleTheme} onLogout={onLogout} onExpired={expire}/>;
 return <Routes><Route path="/login" element={user?<Navigate to={home} replace/>:<LoginPage onSignIn={signIn} sessionError={sessionError} email={email} setEmail={setEmail} theme={theme} toggleTheme={toggleTheme}/>}/><Route path="/admin/*" element={protectedRole('Admin')}/><Route path="/fleet/*" element={protectedRole('Fleet manager')}/><Route path="/warehouse/*" element={protectedRole('Warehouse manager')}/><Route path="*" element={<Navigate to={home} replace/>}/></Routes>;
}
export default function App() {return <BrowserRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Application/></BrowserRouter>;}
