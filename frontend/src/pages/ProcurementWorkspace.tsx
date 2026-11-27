import { useEffect, useRef, useState, type FormEvent } from 'react';
import { read, write, errorMessage, type Context, type Row } from '../services/management';
import { DataTable } from './Management';

type Mode='purchasing'|'supplier'|'policies';
type Item=Row & {quantity:number|string;unit_price?:number|string;material_name?:string;material_code?:string;unit?:string};
type Document=Row & {items?:Item[]};
const list=(path:string)=>read<{rows:Document[]}>('procurement/'+path).then(d=>d.rows);
const name=(row:Row)=>String(row.name??row.full_name??row.code??row.reference_no??'');
const day=(value:unknown)=>String(value??'').slice(0,10);
const total=(row:Document)=>row.items?.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price??0),0)??0;

export default function ProcurementWorkspace({mode,permissions,context}:{mode:Mode;permissions:readonly string[];context:Context}) {
 const can=(permission:string)=>permissions.includes(permission);
 const [data,setData]=useState<Record<string,Document[]>>({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 const flight=useRef(false);
 const [pr,setPr]=useState(''),[due,setDue]=useState(''),[invited,setInvited]=useState<string[]>([]);
 const [rfq,setRfq]=useState(''),[valid,setValid]=useState(''),[lead,setLead]=useState(''),[terms,setTerms]=useState(''),[prices,setPrices]=useState<Record<string,string>>({});
 const [quotation,setQuotation]=useState(''),[reference,setReference]=useState(''),[comments,setComments]=useState<Record<string,string>>({});
 const [project,setProject]=useState(''),[kind,setKind]=useState('REQUISITION'),[reviewer,setReviewer]=useState(''),[active,setActive]=useState(true),[supplier,setSupplier]=useState(''),[account,setAccount]=useState('');
 useEffect(()=>{
  let live=true;setLoading(true);setError('');setData({});
  const tasks:[string,Promise<Document[]>][]=[];
  if(mode==='purchasing'){
   if(permissions.includes('requisition.read'))tasks.push(['requisitions',list('requisitions')]);
   if(permissions.includes('supplier.read'))tasks.push(['suppliers',list('suppliers')]);
   if(permissions.includes('quotation.read'))tasks.push(['quotations',list('quotations')],['rfqs',list('rfqs')]);
   if(permissions.includes('purchase_order.read'))tasks.push(['orders',list('purchase-orders')]);
   if(permissions.includes('purchase_order.approve'))tasks.push(['queue',list('purchase-order-approvals/queue')]);
  }else if(mode==='supplier'){
   if(permissions.includes('rfq.supplier.read'))tasks.push(['rfqs',list('supplier/rfqs')]);
   if(permissions.includes('quotation.supplier.submit'))tasks.push(['quotations',list('supplier/quotations')]);
   if(permissions.includes('purchase_order.supplier.read'))tasks.push(['orders',list('supplier/purchase-orders')]);
  }else{
   if(permissions.includes('procurement.policy.manage'))tasks.push(['policies',list('approval-policies')],['reviewers',list('reviewers')]);
   if(permissions.includes('users.update'))tasks.push(['users',read<{rows:Document[]}>('admin/users').then(d=>d.rows)],['suppliers',list('suppliers')]);
  }
  Promise.all(tasks.map(async([key,promise])=>[key,await promise] as const)).then(rows=>{if(live)setData(Object.fromEntries(rows));}).catch(e=>{if(live)setError(errorMessage(e));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[mode,revision,permissions]);
 const run=async(path:string,body:unknown,method:'post'|'put'='post',reset?:()=>void)=>{
  if(flight.current)return;flight.current=true;setBusy(true);setError('');setMessage('');
  try{await write('procurement/'+path,body,method);setMessage('Saved successfully.');reset?.();setRevision(v=>v+1);}catch(e){setError(errorMessage(e));}finally{flight.current=false;setBusy(false);}
 };
 const submitRFQ=(event:FormEvent)=>{event.preventDefault();if(!invited.length){setError('Select at least one active supplier.');return;}void run('rfqs',{requisition_id:pr,due_date:due,supplier_ids:invited},'post',()=>{setPr('');setDue('');setInvited([]);});};
 const selectedRFQ=data.rfqs?.find(r=>r.id===rfq);
 const submitQuotation=(event:FormEvent)=>{event.preventDefault();const items=selectedRFQ?.items??[];
  if(!items.length||items.some(i=>prices[i.id]===''||prices[i.id]===undefined||!Number.isFinite(Number(prices[i.id]))||Number(prices[i.id])<0)){setError('Enter a non-negative unit price for every requested material.');return;}
  void run('supplier/quotations',{rfq_id:rfq,valid_until:valid,lead_time_days:Number(lead),delivery_terms:terms,items:items.map(i=>({requisition_item_id:i.id,quantity:Number(i.quantity),unit_price:Number(prices[i.id])}))},'post',()=>{setRfq('');setValid('');setLead('');setTerms('');setPrices({});});
 };
 const decide=(row:Row,action:'approve'|'reject')=>{const comment=comments[row.id]?.trim()??'';if(action==='reject'&&!comment){setError('Explain why this purchase order is being rejected.');return;}void run(`purchase-order-approvals/${row.id}/${action}`,{comments:comment||null});};
 const selectedQuote=data.quotations?.find(r=>r.id===quotation);
 const options=(rows:Row[]|undefined)=>rows?.map(row=><option key={row.id} value={row.id}>{name(row)}</option>);
 const projectName=(id:unknown)=>name(context.projects.find(p=>p.id===id)??{id:''})||'Project outside current reference list';
 const reviewers=data.reviewers?.filter(row=>row.role==='SUPPLY_CHAIN_MANAGER');
 return <section className="manage-page">
  <header className="manage-page-header"><div><h1>{mode==='supplier'?'Supplier workspace':mode==='policies'?'Procurement approval settings':'Purchasing workspace'}</h1><p>{mode==='supplier'?'Respond to your invited requests and view your approved orders.':mode==='policies'?'Assign an independent reviewer to each project and document type.':'Request supplier quotations, compare prices and create purchase orders.'}</p></div><button type="button" className="button button-outline" disabled={loading||busy} onClick={()=>setRevision(v=>v+1)}>Refresh</button></header>
  {error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status" className="form-success">{message}</p>}
  {loading?<p role="status">Loading procurement records…</p>:<>
   {mode==='purchasing'&&<>
    {can('rfq.create')&&<section className="manage-card"><h2>Request quotations</h2><form className="manage-form" onSubmit={submitRFQ}>
     <label className="manage-field">Approved requisition<select required value={pr} onChange={e=>setPr(e.target.value)}><option value="">Select an approved requisition</option>{data.requisitions?.filter(r=>r.status==='APPROVED').map(r=><option key={r.id} value={r.id}>{String(r.code)} — {String(r.project_name)}</option>)}</select></label>
     <label className="manage-field">Response deadline<input required type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
     <fieldset><legend>Invite active suppliers</legend>{data.suppliers?.filter(s=>s.status==='ACTIVE').map(s=><label className="manage-checkbox" key={s.id}><input type="checkbox" checked={invited.includes(s.id)} onChange={e=>setInvited(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id))}/>{name(s)}</label>)}{!data.suppliers?.some(s=>s.status==='ACTIVE')&&<p>No active suppliers are available.</p>}</fieldset>
     <button className="button button-primary" disabled={busy}>Send quotation request</button>
    </form></section>}
    {can('quotation.read')&&<section className="manage-card"><h2>Quotation comparison</h2><p>Compare quotations for the same requisition and requested quantities. Prices below come from supplier submissions.</p>
     <DataTable rows={(data.quotations??[]).map(q=>({...q,quoted_total:total(q).toFixed(2),valid_until:day(q.valid_until)}))} columns={['requisition_code','supplier_name','quoted_total','lead_time_days','valid_until','delivery_terms']}/>
    </section>}
    {can('purchase_order.create')&&<section className="manage-card"><h2>Create purchase order</h2><form className="manage-form" onSubmit={e=>{e.preventDefault();void run('purchase-orders',{quotation_id:quotation,reference_no:reference.trim()},'post',()=>{setQuotation('');setReference('');});}}>
     <label className="manage-field">Supplier quotation<select required value={quotation} onChange={e=>setQuotation(e.target.value)}><option value="">Select a quotation</option>{data.quotations?.map(q=><option key={q.id} value={q.id}>{String(q.requisition_code)} — {String(q.supplier_name)} — {total(q).toFixed(2)} — {String(q.lead_time_days)} days</option>)}</select></label>
     <label className="manage-field">Order reference<input required maxLength={255} value={reference} onChange={e=>setReference(e.target.value)}/></label>{selectedQuote&&<p>Selected supplier: {String(selectedQuote.supplier_name)}. Quoted total: {total(selectedQuote).toFixed(2)}.</p>}
     <p>The order will wait for its assigned independent reviewer.</p><button className="button button-primary" disabled={busy}>Submit order for approval</button>
    </form></section>}
    {can('purchase_order.approve')&&<section className="manage-card"><h2>Assigned purchase order approvals</h2><DataTable rows={data.queue??[]} columns={['reference_no','project_id','total_value','created_at']} refs={{projects:context.projects}} actions={row=><div><label className="manage-field">Review comment for {String(row.reference_no)}<input maxLength={4000} value={comments[row.id]??''} onChange={e=>setComments(v=>({...v,[row.id]:e.target.value}))}/></label><button className="button button-primary" disabled={busy} onClick={()=>decide(row,'approve')}>Approve order</button><button className="button button-outline" disabled={busy} onClick={()=>decide(row,'reject')}>Reject order</button></div>}/></section>}
    {can('purchase_order.read')&&<section className="manage-card"><h2>Purchase orders</h2><DataTable rows={data.orders??[]} columns={['reference_no','supplier_name','project_id','total_value','status']} refs={{projects:context.projects}}/></section>}
   </>}
   {mode==='supplier'&&<>
    <section className="manage-card"><h2>Invited quotation requests</h2><DataTable rows={(data.rfqs??[]).map(r=>({...r,due_date:day(r.due_date)}))} columns={['requisition_code','due_date']} actions={row=>can('quotation.supplier.submit')?<button className="button button-outline" onClick={()=>{setRfq(row.id);setPrices({});}}>Prepare quotation</button>:null}/></section>
    {can('quotation.supplier.submit')&&<section className="manage-card"><h2>Submit quotation</h2><form className="manage-form" onSubmit={submitQuotation}>
     <label className="manage-field">Invited request<select required value={rfq} onChange={e=>{setRfq(e.target.value);setPrices({});}}><option value="">Select an invited request</option>{data.rfqs?.map(r=><option key={r.id} value={r.id}>{String(r.requisition_code)} — due {day(r.due_date)}</option>)}</select></label>
     {selectedRFQ?.items?.map(i=><label className="manage-field" key={i.id}>Unit price for {i.material_name??i.material_code} ({String(i.quantity)} {i.unit})<input required type="number" min="0" max="999999999" step="0.01" value={prices[i.id]??''} onChange={e=>setPrices(v=>({...v,[i.id]:e.target.value}))}/></label>)}
     <label className="manage-field">Valid until<input required type="date" value={valid} onChange={e=>setValid(e.target.value)}/></label>
     <label className="manage-field">Lead time in days<input required type="number" min="0" max="3650" step="1" value={lead} onChange={e=>setLead(e.target.value)}/></label>
     <label className="manage-field">Delivery terms<textarea maxLength={2000} value={terms} onChange={e=>setTerms(e.target.value)}/></label>
     <button className="button button-primary" disabled={busy||!selectedRFQ?.items?.length}>Submit supplier quotation</button>
    </form></section>}
    <section className="manage-card"><h2>Your quotations</h2><DataTable rows={(data.quotations??[]).map(q=>({...q,submitted:day(q.created_at),valid_until:day(q.valid_until),quoted_total:total(q).toFixed(2)}))} columns={['submitted','valid_until','lead_time_days','quoted_total']}/></section>
    <section className="manage-card"><h2>Your approved purchase orders</h2><DataTable rows={data.orders??[]} columns={['reference_no','total_value','status']} actions={row=><details><summary>Order materials</summary><DataTable rows={(row as Document).items??[]} columns={['material_name','quantity','unit','unit_price']}/></details>}/></section>
   </>}
   {mode==='policies'&&<>
    {can('procurement.policy.manage')&&<section className="manage-card"><h2>Project approval reviewer</h2><p>Each document has one assigned independent reviewer. Financial tiers and multiple approval steps are not configured here.</p><form className="manage-form" onSubmit={e=>{e.preventDefault();void run('approval-policies',{project_id:project,approver_id:reviewer,kind,is_active:active},'put');}}>
     <label className="manage-field">Project<select required value={project} onChange={e=>setProject(e.target.value)}><option value="">Select a project</option>{options(context.projects)}</select></label>
     <label className="manage-field">Document type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="REQUISITION">Material requisition</option><option value="PURCHASE_ORDER">Purchase order</option></select></label>
     <label className="manage-field">Independent reviewer<select required value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">Select a supply chain reviewer</option>{options(reviewers)}</select></label><p>The reviewer needs access to this project. The server checks permission and prevents self approval.</p>
     <label className="manage-checkbox"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Policy active</label><button className="button button-primary" disabled={busy}>Save reviewer policy</button>
    </form><DataTable rows={(data.policies??[]).map(p=>({...p,project:projectName(p.project_id),reviewer:name(data.reviewers?.find(u=>u.id===p.approver_id)??{id:''})||'Unavailable reviewer',document:p.kind==='REQUISITION'?'Material requisition':'Purchase order'}))} columns={['project','document','reviewer','is_active']}/></section>}
    {can('users.update')&&<section className="manage-card"><h2>Link supplier account</h2><form className="manage-form" onSubmit={e=>{e.preventDefault();void run(`suppliers/${supplier}/users/${account}`,{},'put');}}>
     <label className="manage-field">Supplier<select required value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Select a supplier</option>{options(data.suppliers)}</select></label>
     <label className="manage-field">Supplier user account<select required value={account} onChange={e=>setAccount(e.target.value)}><option value="">Select an active supplier user</option>{options(data.users?.filter(u=>u.role==='SUPPLIER_USER'&&u.is_active))}</select></label><button className="button button-primary" disabled={busy}>Link account to supplier</button>
    </form></section>}
   </>}
  </>}
 </section>;
}
