import { useEffect,useRef,useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { read,write,errorMessage,type Context,type Row } from '../services/management';
import { resources,type Field,type Resource } from './managementConfig';
import { StatusPill } from './orgShared';
const label=(key:string)=>key.replace(/_ids?$/,'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function show(v:unknown):string {if(v===null||v===undefined||v==='')return '-';if(typeof v==='boolean')return v?'Yes':'No';if(Array.isArray(v))return v.map(show).join(', ');if(typeof v==='object')return Object.entries(v).map(([k,v])=>`${label(k)}: ${show(v)}`).join(' · ');if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v))return new Date(v).toLocaleString();return String(v);}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=dialog.current;if(d?.showModal)d.showModal();else d?.setAttribute('open','');return()=>{if(d?.open&&d.close)d.close();};},[]);
 return <dialog className="manage-dialog" ref={dialog} onCancel={onClose} aria-label={title}><div className="dialog-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button></div>{children}</dialog>;
}
export function DataTable({rows,columns,refs={},actions}:{rows:Row[];columns:string[];refs?:Record<string,Row[]>;actions?:(row:Row)=>ReactNode}) {
 const reference=(key:string,value:unknown)=>{const ref=key==='project_id'?'projects':key==='site_id'?'sites':key.includes('warehouse')||key==='destination_id'?'warehouses':key==='vehicle_id'?'assets':key==='driver_id'?'drivers':key==='material_id'?'materials':undefined;return ref?refs[ref]?.find(r=>r.id===value):undefined;};
 return <div className="table-scroll"><table className="manage-table"><thead><tr>{columns.map(c=><th key={c}>{label(c)}</th>)}{actions&&<th>Actions</th>}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id??String(i)}>{columns.map(c=><td key={c} data-label={label(c)}>{c==='status'?<StatusPill status={String(row[c])}/>:show(reference(c,row[c])?.name??reference(c,row[c])?.vehicle_number??row[c])}</td>)}{actions&&<td className="manage-actions">{actions(row)}</td>}</tr>)}</tbody></table>{!rows.length&&<div className="org-state" role="status">No records to display in your authorized scope.</div>}</div>;
}
function FieldInput({field,value,onChange,refs,values}:{field:Field;value:unknown;onChange:(v:unknown)=>void;refs:Record<string,Row[]>;values:Record<string,unknown>}) {
 let choices=field.ref?refs[field.ref]??[]:[];
 if(field.ref==='sites'&&values.project_id)choices=choices.filter(r=>r.project_id===values.project_id);
 if(['assets','drivers'].includes(field.ref??'')&&values.project_id)choices=choices.filter(r=>r.project_id===values.project_id);
 const id='field-'+field.key;
 return <label className={field.type==='checkbox'?'manage-checkbox':'manage-field'} htmlFor={id}><span>{field.label}{!field.optional&&field.type!=='checkbox'?' *':''}</span>
  {field.ref||field.options?<select id={id} required={!field.optional} value={String(value??'')} onChange={e=>onChange(e.target.value)}><option value="">Select {field.label.toLowerCase()}</option>{field.ref?choices.map(r=><option value={r.id} key={r.id}>{String(r.name??r.vehicle_number??r.full_name??r.code)}{r.unit?' ('+r.unit+')':''}</option>):field.options!.map(o=><option key={o} value={o}>{label(o.toLowerCase())}</option>)}</select>
  :field.type==='textarea'?<textarea id={id} required={!field.optional} maxLength={2000} value={String(value??'')} onChange={e=>onChange(e.target.value)}/>
  :<input id={id} type={field.type??'text'} required={!field.optional&&field.type!=='checkbox'} checked={field.type==='checkbox'?Boolean(value):undefined} value={field.type==='checkbox'?undefined:String(value??'')} min={field.min??(field.type==='number'?0:undefined)} step={field.type==='number'?'.001':undefined} minLength={field.type==='password'?12:undefined} maxLength={field.type==='password'?72:255} autoComplete={field.type==='password'?'new-password':undefined} onChange={e=>onChange(field.type==='checkbox'?e.target.checked:e.target.value)}/>}
  {field.hint&&<small>{field.hint}</small>}
 </label>;
}
export function ResourcePage({resource,context,onChanged,scope}:{resource:Resource;context:Context;onChanged:()=>void;scope:string}) {
 const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1);
 const [refs,setRefs]=useState<Record<string,Row[]>>({}),[editor,setEditor]=useState<Row| 'new'|null>(null),[values,setValues]=useState<Record<string,unknown>>({}),[action,setAction]=useState<{row:Row;name:string}|null>(null),[details,setDetails]=useState<Row[]|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const inFlight=useRef(false);
 const allRefs={...refs,projects:context.projects,sites:context.sites,warehouses:context.warehouses};
 const refresh=()=>{setRevision(v=>v+1);onChanged();};
 useEffect(()=>{let active=true;setLoading(true);setError('');setRows([]);setSearch('');setStatus('');setPage(1);
  read<{rows:Row[]}>(resource.path).then(data=>{if(active)setRows(data.rows);}).catch(e=>{if(active)setError(errorMessage(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[resource.path,revision]);
 useEffect(()=>{let active=true;const loads:Promise<unknown>[]=[];
  if(resource.path.startsWith('fleet/'))loads.push(Promise.all([read<{rows:Row[]}>('fleet/vehicles'),read<{rows:Row[]}>('fleet/equipment'),read<{rows:Row[]}>('fleet/drivers')]).then(([v,e,d])=>{if(active)setRefs({assets:[...v.rows,...e.rows],drivers:d.rows});}));
  if(resource.path.startsWith('warehouse/'))loads.push(read<{rows:Row[]}>('warehouse/materials').then(m=>{if(active)setRefs({materials:m.rows});}));
  Promise.all(loads).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;};
 },[resource.path,revision]);
 const openEditor=(row:Row|'new')=>{
  setError('');setEditor(row);setValues(Object.fromEntries(resource.fields.filter(f=>!(row!=='new'&&f.key==='password')).map(f=>{
   let value:unknown=row==='new'?(f.type==='checkbox'?true:f.options?.[0]??(f.type==='number'?'0':f.key==='project_id'&&context.projects.some(p=>p.id===scope)?scope:f.key==='warehouse_id'&&context.warehouses.some(w=>w.id===scope)?scope:'')):row[f.key];
   if(value&&f.type==='date')value=String(value).slice(0,10);if(value&&f.type==='datetime-local'){const date=new Date(String(value));value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
   return [f.key,value??''];
  })));
 };
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{
   const fields=resource.fields.filter(f=>!(editor!=='new'&&f.key==='password'));
   const body=Object.fromEntries(fields.flatMap(f=>{let value=values[f.key];if(f.optional&&(value===''||value===undefined))return f.ref||f.type==='date'||f.type==='number'?[[f.key,null]]:[];if(f.type==='number')value=Number(value);if(f.type==='datetime-local')value=new Date(String(value)).toISOString();return [[f.key,value]];}));
   await write(resource.path+(editor==='new'?'':'/'+(editor as Row).id),body,editor==='new'?'post':'patch');setEditor(null);setValues({});setMessage('Record saved.');refresh();
  }catch(e){setError(errorMessage(e));setValues(v=>({...v,password:''}));}finally{inFlight.current=false;setBusy(false);}
 };
 const runAction=async()=>{if(!action||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{
  if(action.name==='access')await write(resource.path+'/'+action.row.id+'/access',{project_ids:values.project_ids??[],site_ids:values.site_ids??[],warehouse_ids:values.warehouse_ids??[]},'put');
  else if(action.name==='password')await write(resource.path+'/'+action.row.id+'/password',{password:values.password});
  else await write(resource.path+'/'+action.row.id+'/'+action.name,{});
  setAction(null);setValues({});setMessage('Operation confirmed.');refresh();
 }catch(e){setError(errorMessage(e));setValues(v=>({...v,password:''}));}finally{setBusy(false);inFlight.current=false;}};
 const visible=rows.filter(row=>(!status||String(row.status??row.role??row.is_active)===status)&&(!scope||resource.path.startsWith('admin/')||row.project_id===scope||row.warehouse_id===scope||row.destination_id===scope||!('project_id'in row)&&!('warehouse_id'in row))&&JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
 const statuses=Array.from(new Set(rows.map(r=>r.status??r.role??r.is_active).filter(v=>v!==undefined))).map(String);
 const canAction=(row:Row,name:string)=>{
  if(name==='receive')return row.status==='IN_TRANSIT';
  if(name==='complete')return row.status==='SCHEDULED';
  if(name==='cancel')return ['PENDING','SCHEDULED'].includes(String(row.status));
  if(name==='post'||name==='dispatch')return row.status==='PENDING';
  return true;
 };
 return <section className="manage-resource">
  <div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>{resource.title}</h1><p>{resource.description}</p></div>{resource.create&&<button className="button button-primary" onClick={()=>openEditor('new')}>+ Create {resource.title==='Users'?'user':'record'}</button>}</div>
  {message&&<p className="manage-success" role="status">{message}</p>}
  {error&&!editor&&!action&&<div className="manage-error" role="alert">{error}<button onClick={refresh}>Try again</button></div>}
  <div className="panel"><div className="manage-toolbar"><label className="manage-search"><span>Search records</span><input aria-label="Search records" placeholder="Search by name, reference or status..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>{statuses.length>0&&<label className="manage-filter"><span>Filter status / role</span><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">All</option>{statuses.map(v=><option key={v}>{v}</option>)}</select></label>}<button className="button button-outline" onClick={refresh}>Refresh</button></div>
   {loading?<p className="org-state" role="status">Loading records...</p>:<DataTable rows={visible.slice((page-1)*12,page*12)} columns={resource.columns} refs={allRefs} actions={row=><>
    <button className="text-button" onClick={()=>setDetails([row])}>View</button>
    {resource.edit&&!['COMPLETED','CANCELLED'].includes(String(row.status))&&<button className="text-button" onClick={()=>openEditor(row)}>Edit</button>}
    {resource.actions?.filter(name=>canAction(row,name)).map(name=><button className="text-button" key={name} onClick={async()=>{setError('');if(name==='history'){try{setDetails((await read<{rows:Row[]}>(resource.path+'/'+row.id+'/history')).rows);}catch(e){setError(errorMessage(e));}}else{setAction({row,name});setValues(name==='access'?{project_ids:row.project_ids,site_ids:row.site_ids,warehouse_ids:row.warehouse_ids}:{});}}}>{label(name)}</button>)}
   </>}/>}
   <div className="table-footer"><span>{visible.length} record{visible.length===1?'':'s'} · Page {page} of {Math.max(1,Math.ceil(visible.length/12))}</span><div><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><button disabled={page*12>=visible.length} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>
  </div>
  {resource.path==='warehouse/inventory'&&<p className="manage-help">Register materials in <Link to="/warehouse/materials">Material Master</Link>, then post a goods receipt to add stock.</p>}
  {['warehouse/counts','warehouse/adjustments'].includes(resource.path)&&<p className="manage-help">A separate authorized Warehouse Manager must post your reconciliation. If stock has changed, cancel and recount.</p>}
  {editor&&<Modal title={editor==='new'?'Create '+resource.title:'Edit '+resource.title} onClose={()=>{if(!busy){setEditor(null);setValues({});setError('');}}}><form onSubmit={save}><div className="manage-form-grid">{resource.fields.filter(f=>!(editor!=='new'&&f.key==='password')).map(f=><FieldInput key={f.key} field={f} value={values[f.key]} values={values} refs={allRefs} onChange={value=>setValues(v=>({...v,[f.key]:value,...(f.key==='project_id'?{site_id:''}:{})}))}/>)}</div>{error&&<p className="manage-error" role="alert">{error}</p>}<div className="dialog-footer"><button type="button" className="button button-outline" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?'Saving...':'Save record'}</button></div></form></Modal>}
  {action&&<Modal title={label(action.name)+' · '+String(action.row.reference??action.row.full_name??'Confirm operation')} onClose={()=>{if(!busy){setAction(null);setValues({});setError('');}}}><form onSubmit={e=>{e.preventDefault();void runAction();}}>
   {action.name==='access'?<div className="access-grid">{(['projects','sites','warehouses'] as const).map(key=><fieldset key={key}><legend>{label(key)}</legend>{context[key].map(row=><label className="manage-checkbox" key={row.id}><input type="checkbox" checked={((values[key==='projects'?'project_ids':key==='sites'?'site_ids':'warehouse_ids']??[])as string[]).includes(row.id)} onChange={e=>{const field=key==='projects'?'project_ids':key==='sites'?'site_ids':'warehouse_ids';setValues(v=>({...v,[field]:e.target.checked?[...(v[field]as string[]??[]),row.id]:(v[field]as string[]).filter(id=>id!==row.id)}));}}/>{String(row.name)}</label>)}</fieldset>)}</div>
   :action.name==='password'?<FieldInput field={{key:'password',label:'New password',type:'password'}} value={values.password} values={values} refs={{}} onChange={password=>setValues({password})}/>
   :<p className="manage-help">Confirm {action.name} for reference <strong>{String(action.row.reference??action.row.id)}</strong>. This will update the database and record an audit event.</p>}
   {error&&<p className="manage-error" role="alert">{error}</p>}<div className="dialog-footer"><button type="button" className="button button-outline" disabled={busy} onClick={()=>setAction(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?'Processing...':'Confirm '+action.name}</button></div>
  </form></Modal>}
  {details&&<Modal title="Record details and history" onClose={()=>setDetails(null)}>{!details.length?<p>No history recorded yet.</p>:details.map((row,i)=><dl className="detail-grid" key={i}>{Object.entries(row).map(([key,value])=><div key={key}><dt>{label(key)}</dt><dd>{show(value)}</dd></div>)}</dl>)}</Modal>}
 </section>;
}
export function ManagedRoute({path,...props}:{path:string;context:Context;onChanged:()=>void;scope:string}) {const resource=resources[path];return resource?<ResourcePage key={path} resource={resource} {...props}/>:<p>Page not found.</p>;}
export function RolesPage() {
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState('');useEffect(()=>{read<{rows:Row[]}>('admin/roles').then(d=>setRows(d.rows)).catch(e=>setError(errorMessage(e)));},[]);
 return <><div className="page-heading"><div><div className="eyebrow">EXPLICIT ACCESS POLICY</div><h1>Roles & Permissions</h1><p>Permissions are enforced by the backend. Role assignments and location grants are managed under Users.</p></div></div>{error&&<p role="alert">{error}</p>}<div className="permission-grid">{rows.map(row=><article className="panel permission-card" key={row.id}><h2>{String(row.name)}</h2><ul>{(row.permissions as string[]).map(p=><li key={p}>{label(p.replace(/\./g,' '))}</li>)}</ul></article>)}</div></>;
}
