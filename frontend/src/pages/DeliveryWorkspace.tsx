import { useEffect, useRef, useState } from 'react';
import { read, write, errorMessage } from '../services/management';

type Option={id:string;name?:string;code?:string;unit?:string;project_id?:string;site_id?:string;reference_no?:string;vehicle_number?:string;driver_name?:string;starts_at?:string;ends_at?:string};
type Options={projects:Option[];sites:Option[];warehouses:Option[];materials:Option[];assignments:Option[];purchaseOrders:Option[]};
type Item={id:string;material_id:string;material_name?:string;unit?:string;quantity:number};
type RecordRow={id:string;status:string;project_id:string;project_name?:string;site_name?:string;warehouse_name?:string;destination_site_id:string;vehicle_number?:string;driver_name?:string;needed_at?:string;eta?:string;items:Item[];events?:{status:string;notes:string;created_at:string}[];proof?:{receiver_name:string;received_at:string;notes:string}|null;receipt?:unknown[]};
type ReceiptLine={delivery_item_id:string;accepted_quantity:number;rejected_quantity:number;short_quantity:number;reason:string};
const empty:Options={projects:[],sites:[],warehouses:[],materials:[],assignments:[],purchaseOrders:[]};
const localStamp=(value:string)=>new Date(value).toISOString();
const nowLocal=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};

/** Shared role-aware workflow. Every mutation remains authorized and scoped by the API. */
export function DeliveryWorkspace({permissions}:{permissions:readonly string[]}) {
 const allowed=(permission:string)=>permissions.includes(permission);
 const canRequest=allowed('transport_request.create'),canPlan=allowed('delivery.assign'),canRequests=allowed('transport_request.read');
 const [tab,setTab]=useState<'transport-requests'|'deliveries'>(canRequests?'transport-requests':'deliveries');
 const [options,setOptions]=useState<Options>(empty),[rows,setRows]=useState<RecordRow[]>([]),[detail,setDetail]=useState<RecordRow|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const inFlight=useRef(false);
 const [creating,setCreating]=useState(false),[project,setProject]=useState(''),[destination,setDestination]=useState(''),[warehouse,setWarehouse]=useState(''),[order,setOrder]=useState(''),[needed,setNeeded]=useState(''),[notes,setNotes]=useState('');
 const [lines,setLines]=useState([{material_id:'',quantity:'1'}]),[assignment,setAssignment]=useState(''),[eta,setEta]=useState('');
 const [planQuantities,setPlanQuantities]=useState<Record<string,string>>({});
 const [reason,setReason]=useState(''),[receiver,setReceiver]=useState(''),[receivedAt,setReceivedAt]=useState(nowLocal),[receipt,setReceipt]=useState<ReceiptLine[]>([]);
 useEffect(()=>{let active=true;setLoading(true);setError('');setDetail(null);
  read<{rows:RecordRow[]}>(`delivery/${tab}`).then(d=>{if(active)setRows(d.rows);}).catch(e=>{if(active)setError(errorMessage(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[tab,revision]);
 useEffect(()=>{if(!canRequest&&!canPlan)return;let active=true;
  read<Options>('delivery/options').then(d=>{if(active)setOptions(d);}).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;};
 },[canRequest,canPlan,revision]);
 const open=async(id:string)=>{
  setError('');setReason('');setReceiver('');setReceivedAt(nowLocal());
  try{const d=await read<{row:RecordRow}>(`delivery/${tab}/${id}`);setDetail(d.row);setAssignment('');setEta('');
   setPlanQuantities(Object.fromEntries(d.row.items.map(i=>[i.material_id,String(i.quantity)])));
   setReceipt(d.row.items.map(i=>({delivery_item_id:i.id,accepted_quantity:Number(i.quantity),rejected_quantity:0,short_quantity:0,reason:''})));
  }catch(e){setError(errorMessage(e));}
 };
 const execute=async(path:string,body:unknown,message:string)=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');
  try{await write('delivery/'+path,body);setNotice(message);setCreating(false);setDetail(null);setRevision(v=>v+1);}
  catch(e){setError(errorMessage(e));}finally{inFlight.current=false;setBusy(false);}
 };
 const select=(label:string,value:string,onChange:(v:string)=>void,choices:Option[],required=true)=><label className="manage-field"><span>{label}</span><select required={required} value={value} onChange={e=>onChange(e.target.value)} disabled={busy}><option value="">{required?'Select an option':'No purchase order — site need'}</option>{choices.map(o=><option key={o.id} value={o.id}>{o.name??o.reference_no??`${o.vehicle_number} · ${o.driver_name} · ${o.starts_at}`}{o.code?` (${o.code})`:''}</option>)}</select></label>;
 const changeReceipt=(index:number,key:keyof ReceiptLine,value:string)=>setReceipt(previous=>previous.map((line,i)=>i===index?{...line,[key]:key==='reason'?value:Number(value)}:line));
 const status=(next:string)=>detail&&void execute(`deliveries/${detail.id}/status`,{status:next,notes:reason},'Delivery status updated.');
 return <section className="manage-resource">
  <div className="page-heading"><div><h1>Transport & Deliveries</h1><p>Plan authorized transport, follow delivery progress and reconcile site receipts.</p></div>
   <div className="hero-actions">{canRequests&&<button className="button button-outline" onClick={()=>{setTab('transport-requests');setCreating(false);}}>Transport requests</button>}<button className="button button-outline" onClick={()=>{setTab('deliveries');setCreating(false);}}>Deliveries</button><button className="button button-outline" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh</button></div>
  </div>
  {error&&<p className="manage-error" role="alert">{error}</p>}{notice&&<p className="manage-success" role="status">{notice}</p>}
  {tab==='transport-requests'&&canRequest&&<button className="button button-primary" disabled={busy} onClick={()=>setCreating(v=>!v)}>{creating?'Close request form':'New transport request'}</button>}
  {creating&&canRequest&&tab==='transport-requests'&&<form className="panel" style={{padding:24}} onSubmit={e=>{e.preventDefault();void execute('transport-requests',{project_id:project,destination_site_id:destination,warehouse_id:warehouse,purchase_order_id:order||null,needed_at:localStamp(needed),notes,items:lines.map(i=>({material_id:i.material_id,quantity:Number(i.quantity)}))},'Transport request saved.');}}>
   <h2>Request transport</h2><div className="manage-form-grid">
    {select('Project',project,v=>{setProject(v);setDestination('');setOrder('');},options.projects)}
    {select('Destination site',destination,setDestination,options.sites.filter(s=>s.project_id===project))}
    {select('Source warehouse',warehouse,setWarehouse,options.warehouses)}
    {select('Approved purchase order (optional)',order,setOrder,options.purchaseOrders.filter(o=>o.project_id===project),false)}
    <label className="manage-field"><span>Needed at</span><input required type="datetime-local" value={needed} onChange={e=>setNeeded(e.target.value)} disabled={busy}/></label>
    <label className="manage-field"><span>Transport notes</span><textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} disabled={busy}/></label>
   </div>
   <h3>Materials</h3>{lines.map((line,index)=><div className="manage-form-grid" key={index}>
    {select(`Material ${index+1}`,line.material_id,v=>setLines(previous=>previous.map((i,n)=>n===index?{...i,material_id:v}:i)),options.materials)}
    <label className="manage-field"><span>Quantity {index+1} ({options.materials.find(m=>m.id===line.material_id)?.unit??'material unit'})</span><input required type="number" min="0.001" step="0.001" value={line.quantity} disabled={busy} onChange={e=>setLines(previous=>previous.map((i,n)=>n===index?{...i,quantity:e.target.value}:i))}/></label>
    <button type="button" className="button button-outline" disabled={busy||lines.length===1} onClick={()=>setLines(previous=>previous.filter((_,n)=>n!==index))}>Remove line {index+1}</button>
   </div>)}<div className="dialog-footer"><button type="button" className="button button-outline" disabled={busy||lines.length>=100} onClick={()=>setLines(previous=>[...previous,{material_id:'',quantity:'1'}])}>Add material</button><button className="button button-primary" disabled={busy}>{busy?'Saving…':'Save transport request'}</button></div>
  </form>}
  {loading?<p role="status">Loading deliveries…</p>:<div className="panel table-scroll"><table className="manage-table"><thead><tr><th>Reference</th><th>Project</th><th>Site</th><th>Status</th><th>{tab==='deliveries'?'Vehicle / driver':'Needed at'}</th><th>Action</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.id.slice(0,8)}</td><td>{row.project_name}</td><td>{row.site_name}</td><td>{row.status.replaceAll('_',' ')}</td><td>{tab==='deliveries'?`${row.vehicle_number??''} / ${row.driver_name??''}`:row.needed_at?new Date(row.needed_at).toLocaleString():''}</td><td><button className="text-button" disabled={busy} onClick={()=>void open(row.id)}>View {row.id.slice(0,8)}</button></td></tr>)}</tbody></table>{!rows.length&&<p role="status">No records in your authorized scope.</p>}</div>}
  {detail&&<section className="panel" style={{padding:24}} aria-label="Delivery details">
   <div className="panel-heading"><h2>{tab==='deliveries'?'Delivery':'Transport request'} · {detail.id.slice(0,8)}</h2><button className="button button-outline" onClick={()=>setDetail(null)}>Close details</button></div>
   <p>Status: <strong>{detail.status}</strong></p><ul>{detail.items.map(i=><li key={i.id}>{i.material_name??i.material_id}: {i.quantity} {i.unit}</li>)}</ul>
   {tab==='transport-requests'&&canPlan&&!['COMPLETED','CANCELLED'].includes(detail.status)&&<form onSubmit={e=>{e.preventDefault();const items=detail.items.filter(i=>Number(planQuantities[i.material_id])>0).map(i=>({material_id:i.material_id,quantity:Number(planQuantities[i.material_id])}));void execute('deliveries',{transport_request_id:detail.id,assignment_id:assignment,eta:localStamp(eta),items},'Delivery planned.');}}>
    <h3>Plan a delivery</h3><p>Select a Fleet Manager-approved assignment for the same project/site. Plan remaining quantities only.</p>
    {select('Vehicle and driver assignment',assignment,setAssignment,options.assignments.filter(a=>a.project_id===detail.project_id&&a.site_id===detail.destination_site_id))}
    <label className="manage-field"><span>Estimated arrival</span><input required type="datetime-local" value={eta} disabled={busy} onChange={e=>setEta(e.target.value)}/></label>
    {detail.items.map(i=><label className="manage-field" key={i.id}><span>Planned {i.material_name??i.material_id} ({i.unit})</span><input type="number" required min="0" step="0.001" value={planQuantities[i.material_id]??'0'} disabled={busy} onChange={e=>setPlanQuantities(previous=>({...previous,[i.material_id]:e.target.value}))}/></label>)}
    <button className="button button-primary" disabled={busy}>Plan delivery</button>
   </form>}
   {tab==='deliveries'&&<>
    {(allowed('delivery.update')||allowed('delivery.assigned.update'))&&!['COMPLETED','CANCELLED','FAILED'].includes(detail.status)&&<div><label className="manage-field"><span>Status update / exception reason</span><textarea maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label><div className="hero-actions">
     {allowed('delivery.update')&&detail.status==='PLANNED'&&<><button className="button button-primary" disabled={busy} onClick={()=>status('DISPATCHED')}>Dispatch</button><button className="button button-outline" disabled={busy} onClick={()=>status('CANCELLED')}>Cancel delivery</button></>}
     {detail.status==='DISPATCHED'&&<button className="button button-primary" disabled={busy} onClick={()=>status('IN_TRANSIT')}>Start journey</button>}
     {detail.status==='IN_TRANSIT'&&<button className="button button-primary" disabled={busy} onClick={()=>status('ARRIVED')}>Confirm arrival</button>}
     {['DISPATCHED','IN_TRANSIT'].includes(detail.status)&&<button className="button button-outline" disabled={busy} onClick={()=>status('FAILED')}>Report failed delivery</button>}
    </div></div>}
    {allowed('proof_of_delivery.submit')&&detail.status==='ARRIVED'&&!detail.proof&&<form onSubmit={e=>{e.preventDefault();void execute(`deliveries/${detail.id}/proof`,{receiver_name:receiver,received_at:localStamp(receivedAt),notes:reason},'Receiver acknowledgement recorded.');}}>
     <h3>Receiver acknowledgement</h3><p>Record the recipient and delivery time. Photo and signature uploads are not available in this release.</p>
     <label className="manage-field"><span>Receiver name</span><input required maxLength={255} value={receiver} disabled={busy} onChange={e=>setReceiver(e.target.value)}/></label>
     <label className="manage-field"><span>Received at</span><input required type="datetime-local" value={receivedAt} disabled={busy} onChange={e=>setReceivedAt(e.target.value)}/></label>
     <button className="button button-primary" disabled={busy}>Record acknowledgement</button>
    </form>}
    {detail.proof&&<p>Receiver acknowledgement: {detail.proof.receiver_name} · {new Date(detail.proof.received_at).toLocaleString()}</p>}
    {allowed('site_receipt.confirm')&&detail.status==='ARRIVED'&&<form onSubmit={e=>{e.preventDefault();void execute(`deliveries/${detail.id}/receipt`,{notes:reason,items:receipt},'Site receipt recorded and quantities reconciled.');}}>
     <h3>Reconcile site receipt</h3><p>Accepted + rejected + short must equal each dispatched quantity. Driver acknowledgement is required.</p>
     {receipt.map((line,index)=><fieldset key={line.delivery_item_id}><legend>{detail.items[index]?.material_name} · dispatched {detail.items[index]?.quantity} {detail.items[index]?.unit}</legend><div className="manage-form-grid">
      {(['accepted_quantity','rejected_quantity','short_quantity'] as const).map(key=><label className="manage-field" key={key}><span>{key.replace('_quantity','')} {index+1}</span><input required type="number" min="0" step="0.001" disabled={busy} value={line[key]} onChange={e=>changeReceipt(index,key,e.target.value)}/></label>)}
      <label className="manage-field"><span>Discrepancy reason {index+1}</span><input required={line.rejected_quantity>0||line.short_quantity>0} maxLength={2000} value={line.reason} disabled={busy} onChange={e=>changeReceipt(index,'reason',e.target.value)}/></label>
     </div></fieldset>)}<button className="button button-primary" disabled={busy}>Confirm site receipt</button>
    </form>}
    {!!detail.receipt?.length&&<p>Site receipt has been recorded. Receiver evidence and quantities are immutable.</p>}
    <h3>Delivery history</h3><ol>{detail.events?.map((event,index)=><li key={index}>{event.status} · {new Date(event.created_at).toLocaleString()} {event.notes}</li>)}</ol>
   </>}
  </section>}
 </section>;
}
