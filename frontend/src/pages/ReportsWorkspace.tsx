import { useEffect, useState, type FormEvent } from 'react';
import { apiClient, unwrapResponse } from '../services/api';
import { errorMessage } from '../services/management';

type Row=Record<string,unknown>;
interface CostReport {rows:Row[];totals:Row[];budgets:Row[];notice?:string}
interface OperationsReport {fleet:Row[];inventory:Row[];notice?:string}
interface AuditReport {rows:Row[];notice?:string}
export interface ReportsWorkspaceProps {mode?:'costs'|'operations'|'audit';permissions:string[]}

function today():string {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 return ['year','month','day'].map(key=>parts.find(part=>part.type===key)!.value).join('-');
}
function Table({rows,columns}:{rows:Row[];columns:string[]}) {
 return <div className="table-scroll"><table className="manage-table"><thead><tr>{columns.map(key=><th key={key} scope="col">{key.replaceAll('_',' ')}</th>)}</tr></thead>
  <tbody>{rows.map((row,index)=><tr key={String(row.id??index)}>{columns.map(key=><td key={key}>{row[key]&&typeof row[key]==='object'?JSON.stringify(row[key]):String(row[key]??'—')}</td>)}</tr>)}</tbody></table>
  {!rows.length&&<p className="org-state" role="status">No records in this authorized scope and period.</p>}</div>;
}

/** Reports never manufacture costs or combine currencies. Mutations require explicit capabilities. */
export default function ReportsWorkspace({mode='operations',permissions}:ReportsWorkspaceProps) {
 const end=today();
 const [from,setFrom]=useState(end.slice(0,8)+'01'),[to,setTo]=useState(end),[projectId,setProjectId]=useState('');
 const [projects,setProjects]=useState<{id:string;name:string;code:string}[]>([]);
 const [report,setReport]=useState<CostReport|OperationsReport|AuditReport|null>(null);
 const [loadedMode,setLoadedMode]=useState(mode);
 const [error,setError]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const [revision,setRevision]=useState(0),[referenceError,setReferenceError]=useState('');
 const [auditEvent,setAuditEvent]=useState(''),[auditModule,setAuditModule]=useState('');
 const canWrite=mode==='costs'&&permissions.includes('cost_record.create');
 const canBudget=mode==='costs'&&permissions.includes('cost_budget.manage');
 const canExport=mode==='costs'&&permissions.includes('cost_report.read')&&permissions.includes('cost_report.export');
 useEffect(()=>{
  let active=true;setReferenceError('');
  apiClient.get('/api/v1/reports/projects').then(response=>{if(active)setProjects(unwrapResponse<{rows:{id:string;name:string;code:string}[]}>(response.data).rows);})
   .catch(e=>{if(active)setReferenceError(errorMessage(e));});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  const controller=new AbortController();setError('');setReport(null);
  if(!from||!to||to<from){setLoading(false);setError('Choose a valid start and end date.');return;}
  setLoading(true);
  apiClient.get('/api/v1/reports/'+mode,{params:{from,to,project_id:projectId||undefined,...(mode==='audit'?{event_type:auditEvent.trim()||undefined,module:auditModule.trim()||undefined}:{})},signal:controller.signal})
   .then(response=>{if(!controller.signal.aborted){setReport(unwrapResponse<CostReport|OperationsReport|AuditReport>(response.data));setLoadedMode(mode);}})
   .catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e));})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[mode,from,to,projectId,revision,auditEvent,auditModule]);
 const submit=async(event:FormEvent<HTMLFormElement>,budget=false)=>{
  event.preventDefault();if(saving)return;setError('');setMessage('');
  const form=event.currentTarget,values=new FormData(form),value=(name:string)=>String(values.get(name)??'').trim();
  const amount=value('amount');
  if(!/^\d+(\.\d{1,2})?$/.test(amount)||!Number.isFinite(Number(amount))||Number(amount)<0||(!budget&&Number(amount)===0)){setError('Enter a valid amount with at most two decimal places.');return;}
  if(budget&&!canBudget||!budget&&!canWrite){setError('You do not have permission for this operation.');return;}
  setSaving(true);
  try{
   const body={project_id:value('project_id'),currency:value('currency').toUpperCase(),amount:Number(amount),...(budget?{period_start:value('period_start'),period_end:value('period_end')}:{cost_type:value('cost_type'),incurred_on:value('incurred_on'),reference:value('reference'),evidence_reference:value('evidence_reference'),description:value('description')})};
   if(budget)await apiClient.put('/api/v1/reports/budgets',body);else await apiClient.post('/api/v1/reports/costs',body);
   form.reset();setMessage(budget?'Budget saved.':'Cost evidence recorded.');setRevision(v=>v+1);
  }catch(e){setError(errorMessage(e));}finally{setSaving(false);}
 };
 const exportCsv=async()=>{
  if(!canExport||loading||saving||loadedMode!==mode)return;setSaving(true);setError('');
  try{
   const response=await apiClient.get('/api/v1/reports/costs/export',{params:{from,to,project_id:projectId||undefined}});
   const {filename,csv}=unwrapResponse<{filename:string;csv:string}>(response.data);
   const objectUrl=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const link=document.createElement('a');link.href=objectUrl;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(objectUrl);
  }catch(e){setError(errorMessage(e));}finally{setSaving(false);}
 };
 const projectField=(name:string,required=false)=><label className="manage-field">Project<select name={name} required={required} defaultValue=""><option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}</select></label>;
 return <section className="manage-resource">
  <div className="page-heading"><div><div className="eyebrow">AUTHORIZED REPORTING</div><h1>{mode==='costs'?'Project costs & budgets':mode==='audit'?'Audit review':'Operations reports'}</h1><p>Choose an explicit date range and your authorized project scope.</p></div></div>
  <div className="panel manage-toolbar">
   <label className="manage-field">From<input aria-label="Report from" type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label className="manage-field">To<input aria-label="Report to" type="date" required value={to} onChange={e=>setTo(e.target.value)}/></label>
   <label className="manage-field">Project<select aria-label="Report project" value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">All authorized projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}</select></label>
   {mode==='audit'&&<><label className="manage-field">Event type<input aria-label="Audit event type" maxLength={100} value={auditEvent} onChange={e=>setAuditEvent(e.target.value)} placeholder="All event types"/></label><label className="manage-field">Module<input aria-label="Audit module" maxLength={50} value={auditModule} onChange={e=>setAuditModule(e.target.value)} placeholder="All modules"/></label></>}
   <button type="button" className="button button-outline" disabled={loading} onClick={()=>setRevision(v=>v+1)}>Refresh report</button>
   {canExport&&<button type="button" className="button button-outline" disabled={loading||saving||!report||loadedMode!==mode} onClick={exportCsv}>Export CSV</button>}
  </div>
  {referenceError&&<p role="alert" className="manage-error">Project choices could not be loaded: {referenceError}</p>}
  {error&&<p role="alert" className="manage-error">{error}</p>}{message&&<p role="status" className="manage-success">{message}</p>}
  {loading&&<p role="status">Loading report...</p>}
  {report&&loadedMode===mode&&<>
   {report.notice&&<p className="manage-help">{report.notice}</p>}
   {mode==='costs'&&<>
    <section className="panel"><h2>Recorded totals by currency</h2><Table rows={(report as CostReport).totals} columns={['currency','amount']}/></section>
    <section className="panel"><h2>Cost evidence</h2><Table rows={(report as CostReport).rows} columns={['project_name','cost_type','amount','currency','incurred_on','reference','evidence_reference','description']}/></section>
    <section className="panel"><h2>Budget comparison</h2><p className="manage-help">Only budgets with the exact selected start and end dates are compared. Remaining = budget minus recorded actual in the same currency.</p><Table rows={(report as CostReport).budgets} columns={['project_name','currency','budget','actual','remaining']}/></section>
   </>}
   {mode==='operations'&&<><section className="panel"><h2>Fleet utilization</h2><Table rows={(report as OperationsReport).fleet} columns={['vehicle_number','asset_kind','status','assignments','utilization_hours']}/></section><section className="panel"><h2>Inventory movement history</h2><Table rows={(report as OperationsReport).inventory} columns={['code','name','warehouse_name','kind','reference','quantity_change','quarantine_change','created_at']}/></section></>}
   {mode==='audit'&&<section className="panel"><h2>Authorized audit events</h2><Table rows={(report as AuditReport).rows} columns={['event_type','module','created_at','actor','metadata']}/></section>}
  </>}
  {canWrite&&<section className="panel"><h2>Record cost evidence</h2><p className="manage-help">Enter only a verified supply-chain cost. Referencing a fuel/service transaction does not automatically duplicate it here; record each cost once.</p><form onSubmit={event=>void submit(event)}><fieldset disabled={saving||Boolean(referenceError)}><div className="manage-form-grid">
   {projectField('project_id',true)}<label className="manage-field">Cost type<select name="cost_type" required>{['PURCHASE','TRANSPORT','FUEL','MAINTENANCE','WAREHOUSE','WASTAGE','OTHER'].map(t=><option key={t}>{t}</option>)}</select></label>
   <label className="manage-field">Amount<input name="amount" type="number" min="0.01" step="0.01" required/></label><label className="manage-field">Currency<input name="currency" minLength={3} maxLength={3} pattern="[A-Z]{3}" defaultValue="LKR" required/></label>
   <label className="manage-field">Incurred on<input name="incurred_on" type="date" defaultValue={end} required/></label><label className="manage-field">Unique cost reference<input name="reference" maxLength={255} required/></label>
   <label className="manage-field">Evidence reference<input name="evidence_reference" maxLength={1000} required/></label><label className="manage-field">Description<textarea name="description" maxLength={2000} required/></label>
  </div><button className="button button-primary">{saving?'Saving...':'Record cost'}</button></fieldset></form></section>}
  {canBudget&&<section className="panel"><h2>Configure project budget</h2><form onSubmit={event=>void submit(event,true)}><fieldset disabled={saving||Boolean(referenceError)}><div className="manage-form-grid">
   {projectField('project_id',true)}<label className="manage-field">Budget amount<input name="amount" type="number" min="0" step="0.01" required/></label><label className="manage-field">Budget currency<input name="currency" minLength={3} maxLength={3} pattern="[A-Z]{3}" defaultValue="LKR" required/></label>
   <label className="manage-field">Period start<input name="period_start" type="date" defaultValue={from} required/></label><label className="manage-field">Period end<input name="period_end" type="date" defaultValue={to} required/></label>
  </div><button className="button button-primary">{saving?'Saving...':'Save budget'}</button></fieldset></form></section>}
 </section>;
}
