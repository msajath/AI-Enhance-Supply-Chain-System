import { Router } from 'express';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../config/database';
import { hasPermission } from '../auth/permissions';
import type { AuthContext } from '../middleware/authenticate';
import { ApiResponse } from '../utils/apiResponse';
import { audit, fail, insert, permit, project, safe, site, uuid, warehouse } from '../modules/management/shared';
import { canTransition, deliverySchema, proofSchema, receiptSchema, reconciles, transitionSchema, transportSchema } from '../modules/delivery/rules';

const driverRole=(a:AuthContext)=>['DRIVER','DRIVER_OPERATOR'].includes(a.role);
const requestScope=`r.organization_id=$1 AND ($2::boolean OR
 EXISTS(SELECT 1 FROM user_project_access p WHERE p.user_id=$3 AND p.project_id=r.project_id))
 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_site_access s WHERE s.user_id=$3 AND s.site_id=r.destination_site_id))`;
const readPermission=(a:AuthContext)=>hasPermission(a.role,'delivery.read')||hasPermission(a.role,'delivery.assigned.read')||hasPermission(a.role,'site_receipt.confirm')||hasPermission(a.role,'fleet.assignments.manage');
const params=(a:AuthContext)=>[a.organizationId,a.role==='ADMIN',a.userId];
function licenceEnd(value:unknown):Date {
 const date=value instanceof Date?value:new Date(String(value)+'T00:00:00');
 return new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59,59,999);
}

async function loadDelivery(c:PoolClient,a:AuthContext,id:string,lock=false) {
 const d=(await c.query(`SELECT d.*,r.project_id,r.warehouse_id,a.driver_id,a.vehicle_id,a.status assignment_status,
  fd.user_id driver_user_id FROM deliveries d JOIN transport_requests r ON r.id=d.transport_request_id
  JOIN vehicle_assignments a ON a.id=d.assignment_id JOIN fleet_drivers fd ON fd.id=a.driver_id
  WHERE d.id=$1 AND d.organization_id=$2 ${lock?'FOR UPDATE OF d,r,a,fd':''}`,[id,a.organizationId])).rows[0];
 if(!d) fail('Delivery not found.',404);
 if(driverRole(a)){if(d.driver_user_id!==a.userId)fail('Delivery access denied.',403);}
 else {await project(c,a,d.project_id,false);await site(c,a,d.destination_site_id,d.project_id);}
 return d;
}
async function event(c:PoolClient,a:AuthContext,d:Record<string,unknown>,status:string,notes:string,previous?:string) {
 await insert(c,'delivery_events',{organization_id:a.organizationId,delivery_id:d.id,actor_id:a.userId,previous_status:previous??null,status,notes});
 await audit(c,a,'DELIVERY_'+status,{delivery_id:d.id,previous_status:previous??null});
}
async function refreshRequest(c:PoolClient,requestId:string) {
 // Completed deliveries fulfill only their accepted quantities; shortages/rejections can be rescheduled.
 const totals=(await c.query(`SELECT i.quantity,coalesce((SELECT sum(s.accepted_quantity) FROM delivery_items di
   JOIN deliveries d ON d.id=di.delivery_id JOIN site_receipt_items s ON s.delivery_item_id=di.id
   WHERE d.transport_request_id=i.transport_request_id AND di.material_id=i.material_id),0) accepted
   FROM transport_request_items i WHERE i.transport_request_id=$1`,[requestId])).rows;
 const active=(await c.query("SELECT status FROM deliveries WHERE transport_request_id=$1 AND status NOT IN ('COMPLETED','CANCELLED','FAILED')",[requestId])).rows;
 const status=totals.length&&totals.every(i=>Number(i.accepted)>=Number(i.quantity))?'COMPLETED':active.some(d=>d.status!=='PLANNED')?'DISPATCHED':active.length?'PLANNED':'REQUESTED';
 await c.query('UPDATE transport_requests SET status=$2 WHERE id=$1',[requestId,status]);
}

/** Root mounts behind its existing session + requireAuth middleware. No alternate auth system. */
export function createDeliveryRouter() {
 const r=Router();
 r.use((req,res,next)=>{if(!req.auth){res.status(401).json(ApiResponse.error('Authentication required.','UNAUTHENTICATED'));return;}next();});
 r.get('/options',safe(async(req,res)=>{
  const a=req.auth!;
  if(!hasPermission(a.role,'transport_request.create')&&!hasPermission(a.role,'delivery.assign'))fail('Transport planning access denied.',403);
  const args=params(a);
  const projects=(await pool.query(`SELECT p.id,p.name FROM projects p WHERE p.organization_id=$1 AND p.status='ACTIVE'
   AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$3 AND g.project_id=p.id)) ORDER BY p.name`,args)).rows;
  const sites=(await pool.query(`SELECT s.id,s.project_id,s.name FROM sites s WHERE s.organization_id=$1 AND s.status='ACTIVE'
   AND ($2::boolean OR EXISTS(SELECT 1 FROM user_site_access g JOIN user_project_access p ON p.user_id=g.user_id AND p.project_id=s.project_id WHERE g.user_id=$3 AND g.site_id=s.id)) ORDER BY s.name`,args)).rows;
  const warehouses=(await pool.query(`SELECT w.id,w.name FROM warehouses w WHERE w.organization_id=$1 AND w.is_active
   AND ($2::boolean OR EXISTS(SELECT 1 FROM user_warehouse_access g WHERE g.user_id=$3 AND g.warehouse_id=w.id))
   AND (w.site_id IS NULL OR $2::boolean OR EXISTS(SELECT 1 FROM user_site_access s JOIN sites si ON si.id=s.site_id JOIN user_project_access p ON p.user_id=s.user_id AND p.project_id=si.project_id WHERE s.user_id=$3 AND s.site_id=w.site_id)) ORDER BY w.name`,args)).rows;
  const materials=(await pool.query('SELECT id,code,name,unit FROM materials WHERE organization_id=$1 ORDER BY name',[a.organizationId])).rows;
  const assignments=(await pool.query(`SELECT a.id,a.project_id,a.site_id,a.starts_at,a.ends_at,v.vehicle_number,fd.name driver_name
   FROM vehicle_assignments a JOIN fleet_vehicles v ON v.id=a.vehicle_id JOIN fleet_drivers fd ON fd.id=a.driver_id
   WHERE a.organization_id=$1 AND a.status='SCHEDULED' AND a.ends_at>now()
   AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$3 AND g.project_id=a.project_id))
   AND ($2::boolean OR EXISTS(SELECT 1 FROM user_site_access g WHERE g.user_id=$3 AND g.site_id=a.site_id)) ORDER BY a.starts_at`,args)).rows;
  const purchaseOrders=(await pool.query(`SELECT o.id,o.reference_no,o.project_id FROM procurement_purchase_orders o WHERE o.organization_id=$1 AND o.status='OPEN'
   AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$3 AND g.project_id=o.project_id)) ORDER BY o.created_at DESC`,args)).rows;
  res.json(ApiResponse.success({projects,sites,warehouses,materials,assignments,purchaseOrders}));
 }));
 r.get('/transport-requests',permit('transport_request.read'),safe(async(req,res)=>{
  const a=req.auth!;
  const rows=(await pool.query(`SELECT r.*,p.name project_name,s.name site_name,w.name warehouse_name
   FROM transport_requests r JOIN projects p ON p.id=r.project_id JOIN sites s ON s.id=r.destination_site_id
   JOIN warehouses w ON w.id=r.warehouse_id WHERE ${requestScope} ORDER BY r.created_at DESC LIMIT 500`,params(a))).rows;
  res.json(ApiResponse.success({rows}));
 }));
 r.post('/transport-requests',permit('transport_request.create'),safe(async(req,res)=>{
  const v=transportSchema.parse(req.body),a=req.auth!;
  const row=await withTransaction(async c=>{
   await project(c,a,v.project_id);await site(c,a,v.destination_site_id,v.project_id);await warehouse(c,a,v.warehouse_id);
   if(new Date(v.needed_at)<=new Date())fail('Required delivery time must be in the future.',400);
   if(v.purchase_order_id){
    const order=(await c.query("SELECT id FROM procurement_purchase_orders WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND status='OPEN' FOR UPDATE",[v.purchase_order_id,a.organizationId,v.project_id])).rows[0];
    if(!order)fail('An approved purchase order in the selected project is required.',403);
   }
   if(v.stock_document_id){
    const source=(await c.query("SELECT * FROM stock_documents WHERE id=$1 AND organization_id=$2 AND warehouse_id=$3 AND kind='TRANSFER' AND status IN ('PENDING','IN_TRANSIT') FOR UPDATE",[v.stock_document_id,a.organizationId,v.warehouse_id])).rows[0];
    if(!source||v.items.length!==1||source.material_id!==v.items[0].material_id||Number(source.quantity)<v.items[0].quantity)fail('Transport items must match the authorized transfer.',400);
    if(source.destination_id){const target=(await c.query('SELECT site_id FROM warehouses WHERE id=$1 AND organization_id=$2',[source.destination_id,a.organizationId])).rows[0];if(target?.site_id!==v.destination_site_id)fail('Transfer destination does not match the delivery site.',400);}
   }
   const {items,...data}=v;
   const saved=await insert(c,'transport_requests',{...data,organization_id:a.organizationId,requested_by:a.userId});
   for(const item of items){
    if(!(await c.query('SELECT id FROM materials WHERE id=$1 AND organization_id=$2',[item.material_id,a.organizationId])).rowCount)fail('Material access denied.',403);
    if(v.purchase_order_id||v.stock_document_id){
     const limit=v.purchase_order_id?(await c.query(`SELECT coalesce(sum(i.quantity),0) quantity FROM procurement_purchase_order_items i
       JOIN requisition_items ri ON ri.id=i.requisition_item_id WHERE i.purchase_order_id=$1 AND ri.material_id=$2`,[v.purchase_order_id,item.material_id])).rows[0]:
       (await c.query('SELECT quantity FROM stock_documents WHERE id=$1 AND material_id=$2',[v.stock_document_id,item.material_id])).rows[0];
     const allocated=(await c.query(`SELECT coalesce(sum(i.quantity),0) quantity FROM transport_request_items i
       JOIN transport_requests r ON r.id=i.transport_request_id WHERE r.organization_id=$1 AND r.status<>'CANCELLED'
       AND i.material_id=$2 AND (($3::uuid IS NOT NULL AND r.purchase_order_id=$3) OR ($4::uuid IS NOT NULL AND r.stock_document_id=$4))`,
       [a.organizationId,item.material_id,v.purchase_order_id??null,v.stock_document_id??null])).rows[0];
     if(!limit||Math.round((Number(allocated.quantity)+item.quantity)*1000)>Math.round(Number(limit.quantity)*1000))fail('Transport exceeds the remaining approved source quantity.');
    }
    await insert(c,'transport_request_items',{...item,organization_id:a.organizationId,transport_request_id:saved.id});
   }
   await audit(c,a,'TRANSPORT_REQUEST_CREATED',{id:saved.id});return saved;
  });res.status(201).json(ApiResponse.success({row}));
 }));
 r.get('/transport-requests/:id',permit('transport_request.read'),safe(async(req,res)=>{
  const id=uuid.parse(req.params.id),a=req.auth!;
  const rows=(await pool.query(`SELECT r.* FROM transport_requests r WHERE ${requestScope} AND r.id=$4`,[...params(a),id])).rows;
  if(!rows[0])fail('Transport request not found.',404);
  const items=(await pool.query('SELECT i.*,m.name material_name,m.unit FROM transport_request_items i JOIN materials m ON m.id=i.material_id WHERE i.transport_request_id=$1 AND i.organization_id=$2',[id,a.organizationId])).rows;
  res.json(ApiResponse.success({row:{...rows[0],items}}));
 }));
 r.get('/deliveries',safe(async(req,res)=>{
  const a=req.auth!;if(!readPermission(a)&&!hasPermission(a.role,'driver.assignments.read'))fail('Delivery access denied.',403);
  const scope=driverRole(a)?'r.organization_id=$1 AND ($2::boolean OR fd.user_id=$3)':requestScope;
  const rows=(await pool.query(`SELECT d.*,r.project_id,p.name project_name,s.name site_name,v.vehicle_number,fd.name driver_name
   FROM deliveries d JOIN transport_requests r ON r.id=d.transport_request_id JOIN projects p ON p.id=r.project_id
   JOIN sites s ON s.id=d.destination_site_id JOIN vehicle_assignments a ON a.id=d.assignment_id
   JOIN fleet_vehicles v ON v.id=a.vehicle_id JOIN fleet_drivers fd ON fd.id=a.driver_id
   WHERE ${scope} ORDER BY d.created_at DESC LIMIT 500`,params(a))).rows;
  res.json(ApiResponse.success({rows}));
 }));
 r.get('/deliveries/:id',safe(async(req,res)=>{
  const a=req.auth!;if(!readPermission(a)&&!hasPermission(a.role,'driver.assignments.read'))fail('Delivery access denied.',403);
  const row=await withTransaction(async c=>{
   const d=await loadDelivery(c,a,uuid.parse(req.params.id));
   const items=(await c.query('SELECT i.*,m.name material_name,m.unit FROM delivery_items i JOIN materials m ON m.id=i.material_id WHERE i.delivery_id=$1 AND i.organization_id=$2',[d.id,a.organizationId])).rows;
   const events=(await c.query('SELECT status,previous_status,notes,created_at FROM delivery_events WHERE delivery_id=$1 AND organization_id=$2 ORDER BY created_at,id',[d.id,a.organizationId])).rows;
   const proof=(await c.query('SELECT receiver_name,received_at,notes,created_at FROM proofs_of_delivery WHERE delivery_id=$1 AND organization_id=$2',[d.id,a.organizationId])).rows[0]??null;
   const receipt=(await c.query('SELECT r.id,r.received_at,r.notes,i.delivery_item_id,i.accepted_quantity,i.rejected_quantity,i.short_quantity,i.reason FROM site_receipts r JOIN site_receipt_items i ON i.site_receipt_id=r.id WHERE r.delivery_id=$1 AND r.organization_id=$2',[d.id,a.organizationId])).rows;
   return {...d,items,events,proof,receipt};
  });res.json(ApiResponse.success({row}));
 }));
 r.post('/deliveries',permit('delivery.assign'),safe(async(req,res)=>{
  const v=deliverySchema.parse(req.body),a=req.auth!;
  const row=await withTransaction(async c=>{
   const source=(await c.query('SELECT * FROM transport_requests WHERE id=$1 AND organization_id=$2 FOR UPDATE',[v.transport_request_id,a.organizationId])).rows[0];
   if(!source||['CANCELLED','COMPLETED'].includes(source.status))fail('Transport request is not available for planning.');
   await project(c,a,source.project_id);await site(c,a,source.destination_site_id,source.project_id);
   const assignment=(await c.query(`SELECT a.*,v.status vehicle_status,v.capacity_tons,v.capacity_unit,d.status driver_status,d.license_expiry FROM vehicle_assignments a
    JOIN fleet_vehicles v ON v.id=a.vehicle_id JOIN fleet_drivers d ON d.id=a.driver_id
    WHERE a.id=$1 AND a.organization_id=$2 FOR UPDATE OF a,v,d`,[v.assignment_id,a.organizationId])).rows[0];
   if(!assignment||assignment.status!=='SCHEDULED'||assignment.project_id!==source.project_id||assignment.site_id!==source.destination_site_id)fail('Assignment must be scheduled for the request project and destination site.');
   if(assignment.vehicle_status!=='AVAILABLE'||assignment.driver_status!=='AVAILABLE')fail('Assigned vehicle or driver is unavailable.');
   if(licenceEnd(assignment.license_expiry)<new Date(assignment.ends_at))fail('Driver licence expires before the delivery ends.');
   if(Number(assignment.load_quantity)>Number(assignment.capacity_tons))fail('Assignment exceeds vehicle capacity.');
   if(new Date(v.eta)<new Date(assignment.starts_at)||new Date(v.eta)>new Date(assignment.ends_at))fail('ETA must fall within the assigned time window.',400);
   if(new Date(assignment.ends_at)<=new Date())fail('Assignment has already ended.');
   if((await c.query("SELECT id FROM maintenance_records WHERE vehicle_id=$1 AND (status='IN_PROGRESS' OR status='SCHEDULED' AND scheduled_date BETWEEN $2::timestamptz::date AND $3::timestamptz::date)",[assignment.vehicle_id,assignment.starts_at,assignment.ends_at])).rowCount)fail('Vehicle has conflicting maintenance.');
   const saved=await insert(c,'deliveries',{organization_id:a.organizationId,transport_request_id:source.id,assignment_id:v.assignment_id,destination_site_id:source.destination_site_id,eta:v.eta,created_by:a.userId});
   for(const item of v.items){
    const requested=(await c.query('SELECT quantity FROM transport_request_items WHERE transport_request_id=$1 AND material_id=$2 AND organization_id=$3',[source.id,item.material_id,a.organizationId])).rows[0];
    if(!requested)fail('Material was not requested.',400);
    const allocated=(await c.query(`SELECT coalesce(sum(CASE WHEN d.status='COMPLETED' THEN coalesce(s.accepted_quantity,0) ELSE i.quantity END),0) quantity
     FROM delivery_items i JOIN deliveries d ON d.id=i.delivery_id LEFT JOIN site_receipt_items s ON s.delivery_item_id=i.id
     WHERE d.transport_request_id=$1 AND i.material_id=$2 AND d.status NOT IN ('CANCELLED','FAILED')`,[source.id,item.material_id])).rows[0];
    if(Math.round((Number(allocated.quantity)+item.quantity)*1000)>Math.round(Number(requested.quantity)*1000))fail('Delivery exceeds the remaining requested quantity.');
    await insert(c,'delivery_items',{...item,organization_id:a.organizationId,delivery_id:saved.id});
   }
   await event(c,a,saved,'PLANNED','Delivery planned');await refreshRequest(c,source.id);return saved;
  });res.status(201).json(ApiResponse.success({row}));
 }));
 r.post('/deliveries/:id/status',safe(async(req,res)=>{
  const a=req.auth!,v=transitionSchema.parse(req.body),ownDriver=driverRole(a);
  if(!hasPermission(a.role,ownDriver?'delivery.assigned.update':'delivery.update'))fail('Delivery update denied.',403);
  const row=await withTransaction(async c=>{
   const d=await loadDelivery(c,a,uuid.parse(req.params.id),true);
   if(!canTransition(d.status,v.status,ownDriver))fail('This delivery status transition is not allowed.');
   if(v.status==='FAILED'&&!v.notes)fail('A reason is required for a failed delivery.',400);
   if(v.status==='DISPATCHED'&&d.assignment_status!=='SCHEDULED')fail('The assignment is no longer scheduled.');
   if(v.status==='DISPATCHED'){
    const eligibility=(await c.query(`SELECT v.status vehicle_status,fd.status driver_status,fd.license_expiry,a.starts_at,a.ends_at,
      a.load_quantity,v.capacity_tons FROM vehicle_assignments a JOIN fleet_vehicles v ON v.id=a.vehicle_id JOIN fleet_drivers fd ON fd.id=a.driver_id
      WHERE a.id=$1 AND a.organization_id=$2 FOR UPDATE OF v`,[d.assignment_id,a.organizationId])).rows[0];
    if(!eligibility||eligibility.vehicle_status!=='AVAILABLE'||eligibility.driver_status!=='AVAILABLE'||
       Number(eligibility.load_quantity)>Number(eligibility.capacity_tons)||new Date(eligibility.ends_at)<=new Date())fail('Assignment is no longer eligible for dispatch.');
    const expiry=licenceEnd(eligibility.license_expiry);
    if(expiry<new Date(eligibility.ends_at))fail('Driver licence expires before the delivery ends.');
    if((await c.query("SELECT id FROM maintenance_records WHERE vehicle_id=$1 AND (status='IN_PROGRESS' OR status='SCHEDULED' AND scheduled_date BETWEEN $2::timestamptz::date AND $3::timestamptz::date)",[d.vehicle_id,eligibility.starts_at,eligibility.ends_at])).rowCount)fail('Vehicle has restricted maintenance.');
   }
   const saved=(await c.query(`UPDATE deliveries SET status=$2,dispatch_at=CASE WHEN $2='DISPATCHED' THEN now() ELSE dispatch_at END,
    arrived_at=CASE WHEN $2='ARRIVED' THEN now() ELSE arrived_at END WHERE id=$1 AND organization_id=$3 RETURNING *`,[d.id,v.status,a.organizationId])).rows[0];
   await event(c,a,d,v.status,v.notes,d.status);await refreshRequest(c,d.transport_request_id);return saved;
  });res.json(ApiResponse.success({row}));
 }));
 r.post('/deliveries/:id/proof',permit('proof_of_delivery.submit'),safe(async(req,res)=>{
  const a=req.auth!,v=proofSchema.parse(req.body);
  if(!driverRole(a))fail('Only the assigned driver may submit delivery evidence.',403);
  const row=await withTransaction(async c=>{
   const d=await loadDelivery(c,a,uuid.parse(req.params.id),true);
   if(d.status!=='ARRIVED')fail('Delivery must arrive before evidence is submitted.');
   if(new Date(v.received_at)>new Date()||new Date(v.received_at)<new Date(d.dispatch_at))fail('Evidence time must be between dispatch and now.',400);
   const saved=await insert(c,'proofs_of_delivery',{...v,delivery_id:d.id,organization_id:a.organizationId,submitted_by:a.userId});
   await audit(c,a,'DELIVERY_PROOF_SUBMITTED',{delivery_id:d.id,proof_id:saved.id});return saved;
  });res.status(201).json(ApiResponse.success({row}));
 }));
 r.post('/deliveries/:id/receipt',permit('site_receipt.confirm'),safe(async(req,res)=>{
  const a=req.auth!,v=receiptSchema.parse(req.body);
  const row=await withTransaction(async c=>{
   const d=await loadDelivery(c,a,uuid.parse(req.params.id),true);
   if(d.status!=='ARRIVED')fail('Only an arrived delivery can be received.');
   if(!(await c.query('SELECT id FROM proofs_of_delivery WHERE delivery_id=$1 AND organization_id=$2',[d.id,a.organizationId])).rowCount)fail('Assigned-driver delivery evidence is required before site receipt.');
   const items=(await c.query('SELECT id,quantity FROM delivery_items WHERE delivery_id=$1 AND organization_id=$2',[d.id,a.organizationId])).rows;
   if(items.length!==v.items.length)fail('Every delivery item must be reconciled.',400);
   for(const item of v.items){const actual=items.find(i=>i.id===item.delivery_item_id);
    if(!actual||!reconciles(Number(actual.quantity),item.accepted_quantity,item.rejected_quantity,item.short_quantity))fail('Accepted, rejected and short quantities must equal the dispatched quantity.',400);
    if((item.rejected_quantity>0||item.short_quantity>0)&&!item.reason)fail('A reason is required for rejected or short quantities.',400);
   }
   const saved=await insert(c,'site_receipts',{organization_id:a.organizationId,delivery_id:d.id,received_by:a.userId,notes:v.notes});
   for(const item of v.items)await insert(c,'site_receipt_items',{...item,organization_id:a.organizationId,site_receipt_id:saved.id});
   await c.query("UPDATE deliveries SET status='COMPLETED' WHERE id=$1 AND organization_id=$2",[d.id,a.organizationId]);
   await c.query("UPDATE vehicle_assignments SET status='COMPLETED' WHERE id=$1 AND organization_id=$2",[d.assignment_id,a.organizationId]);
   await event(c,a,d,'COMPLETED',v.notes,d.status);await refreshRequest(c,d.transport_request_id);return saved;
  });res.status(201).json(ApiResponse.success({row}));
 }));
 return r;
}
