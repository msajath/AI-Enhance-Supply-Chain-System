import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { compare,hash } from 'bcryptjs';
import { pool,withTransaction } from '../config/database';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';
import { requireAuth } from '../middleware/authenticate';
import { createAdminRouter } from './admin.routes';
import { createFleetRouter } from './fleet.routes';
import { createWarehouseRouter } from './warehouse.routes';
import { safe,fail,audit,orgParams,projectScope,warehouseScope,text } from '../modules/management/shared';
import { PERMISSIONS } from '../auth/permissions';
export function createManagementRouter(sessionMiddleware:RequestHandler) {
 const r=Router();
 r.use(['/admin','/fleet','/warehouse','/driver','/context','/account'],sessionMiddleware,requireAuth,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 r.use((req,res,next)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
   const origin=req.get('Origin');
   if(origin && ![env.CORS_ORIGIN,...(env.NODE_ENV==='production'?[]:['http://localhost:5173','http://127.0.0.1:5173'])].includes(origin) || req.get('Sec-Fetch-Site')==='cross-site') {res.status(403).json(ApiResponse.error('Request origin is not allowed.','FORBIDDEN'));return;}
   if(!req.is('application/json')) {res.status(415).json(ApiResponse.error('JSON request data is required.','INVALID_CONTENT_TYPE'));return;}
  }
  next();
 });
 r.get('/context',safe(async(req,res)=>{
  const a=req.auth!,params=orgParams(a);
  const projects=(await pool.query(`SELECT p.* FROM projects p WHERE p.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.project_id=p.id AND g.user_id=$3)) ORDER BY name`,params)).rows;
  const sites=(await pool.query(`SELECT s.* FROM sites s WHERE s.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_site_access g JOIN user_project_access p ON p.user_id=g.user_id AND p.project_id=s.project_id WHERE g.site_id=s.id AND g.user_id=$3)) ORDER BY name`,params)).rows;
  const warehouses=(await pool.query(`SELECT w.* FROM warehouses w WHERE w.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_warehouse_access g WHERE g.warehouse_id=w.id AND g.user_id=$3)) AND (w.site_id IS NULL OR $2::boolean OR EXISTS(SELECT 1 FROM user_site_access sg JOIN sites si ON si.id=sg.site_id JOIN user_project_access pg ON pg.user_id=sg.user_id AND pg.project_id=si.project_id WHERE sg.site_id=w.site_id AND sg.user_id=$3)) ORDER BY name`,params)).rows;
  const organization=(await pool.query('SELECT id,name,code,address FROM organizations WHERE id=$1',[a.organizationId])).rows[0];
  res.json(ApiResponse.success({projects,sites,warehouses,organization,permissions:PERMISSIONS[a.role]}));
 }));
 r.patch('/account',safe(async(req,res)=>{
  const v=z.object({full_name:text,current_password:z.string().min(1),new_password:z.string().min(12).max(72).refine(v=>Buffer.byteLength(v)<=72).optional()}).strict().parse(req.body),a=req.auth!;
  await withTransaction(async c=>{const old=(await c.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[a.userId])).rows[0];if(!await compare(v.current_password,old.password_hash)) fail('Current password is incorrect.',403);
   await c.query('UPDATE users SET full_name=$2,password_hash=coalesce($3,password_hash),auth_version=auth_version+1 WHERE id=$1',[a.userId,v.full_name,v.new_password?await hash(v.new_password,12):null]);await audit(c,a,'ACCOUNT_UPDATED',{});
  });res.json(ApiResponse.success(null,'Account updated. Sign in again.'));
 }));
 for(const [prefix,role] of [['admin','ADMIN'],['fleet','FLEET_MANAGER'],['warehouse','WAREHOUSE_MANAGER']] as const) r.get('/'+prefix+'/dashboard',safe(async(req,res)=>{
  const a=req.auth!;if(a.role!==role) fail('Dashboard access denied.',403);const params=orgParams(a);let cards: {label:string;value:unknown}[]=[],activity:unknown[]=[],alerts:unknown[]=[];
  if(role==='ADMIN') {
   const totals=(await pool.query(`SELECT (SELECT count(*) FROM users WHERE organization_id=$1 AND is_active) users,(SELECT count(*) FROM projects WHERE organization_id=$1 AND status='ACTIVE') projects,(SELECT count(*) FROM warehouses WHERE organization_id=$1 AND is_active) warehouses,(SELECT count(*) FROM users u WHERE organization_id=$1 AND is_active AND role<>'ADMIN' AND NOT EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=u.id)) pending`,[a.organizationId])).rows[0];
   cards=[{label:'Active users',value:totals.users},{label:'Active projects',value:totals.projects},{label:'Active warehouses',value:totals.warehouses},{label:'Accounts awaiting scope',value:totals.pending}];
   activity=(await pool.query('SELECT l.id,l.event_type,l.created_at,u.full_name FROM system_audit_logs l JOIN users u ON u.id=l.actor_id WHERE u.organization_id=$1 ORDER BY l.created_at DESC LIMIT 8',[a.organizationId])).rows;
   alerts=(await pool.query('SELECT role,count(*) count FROM users WHERE organization_id=$1 AND is_active GROUP BY role',[a.organizationId])).rows;
  } else if(role==='FLEET_MANAGER') {
   const assets=(await pool.query(`SELECT v.*,(SELECT count(*)::int FROM vehicle_assignments a WHERE a.vehicle_id=v.id AND a.status='SCHEDULED' AND now() BETWEEN a.starts_at AND a.ends_at) assigned,(SELECT count(*)::int FROM maintenance_records m WHERE m.vehicle_id=v.id AND m.status='IN_PROGRESS') maintenance FROM fleet_vehicles v WHERE ${projectScope('v')}`,params)).rows;
   cards=[{label:'Assets in scope',value:assets.length},{label:'Available assets',value:assets.filter(v=>v.status==='AVAILABLE'&&!v.assigned&&!v.maintenance).length},{label:'Currently assigned',value:assets.filter(v=>v.assigned).length},{label:'Under maintenance',value:assets.filter(v=>v.maintenance||v.status==='MAINTENANCE').length}];
   activity=(await pool.query(`SELECT a.id,v.vehicle_number,a.status,a.starts_at,a.ends_at FROM vehicle_assignments a JOIN fleet_vehicles v ON v.id=a.vehicle_id WHERE ${projectScope('a')} ORDER BY a.created_at DESC LIMIT 8`,params)).rows;
   alerts=(await pool.query(`SELECT m.id,v.vehicle_number,m.description,m.scheduled_date,m.next_service_date FROM maintenance_records m JOIN fleet_vehicles v ON v.id=m.vehicle_id WHERE ${projectScope('v')} AND (m.status IN ('SCHEDULED','IN_PROGRESS') OR m.next_service_date<=current_date+30 OR m.next_service_mileage<=v.odometer) ORDER BY m.scheduled_date LIMIT 8`,params)).rows;
  } else {
   const stock=(await pool.query(`SELECT b.*,m.reorder_level FROM stock_balances b JOIN materials m ON m.id=b.material_id WHERE ${warehouseScope('b')}`,params)).rows;
   const docs=(await pool.query(`SELECT d.* FROM stock_documents d WHERE ${warehouseScope('d')}`,params)).rows;
   cards=[{label:'Inventory lines',value:stock.length},{label:'Low-stock lines',value:stock.filter(b=>Number(b.quantity)-Number(b.reserved)<=Number(b.reorder_level)).length},{label:'Pending receipts',value:docs.filter(d=>d.kind==='RECEIPT'&&d.status==='PENDING').length},{label:'Open transfers',value:docs.filter(d=>d.kind==='TRANSFER'&&['PENDING','IN_TRANSIT'].includes(d.status)).length}];
   activity=(await pool.query(`SELECT m.id,i.name,m.quantity_change,m.quarantine_change,m.created_at,m.reason FROM stock_movements m JOIN materials i ON i.id=m.material_id WHERE ${warehouseScope('m')} ORDER BY m.created_at DESC LIMIT 8`,params)).rows;
   alerts=stock.filter(b=>Number(b.quarantined)>0).map(b=>({id:b.warehouse_id+'-'+b.material_id,warehouse_id:b.warehouse_id,material_id:b.material_id,quarantined:b.quarantined}));
  }
  res.json(ApiResponse.success({cards,activity,alerts}));
 }));
 // Driver portal: only the assignments of the fleet driver record linked to this login.
 const driverAssignments=`SELECT a.id,v.vehicle_number,v.model,p.name project_name,s.name site_name,a.starts_at,a.ends_at,a.load_quantity,v.capacity_unit,a.status
   FROM vehicle_assignments a JOIN fleet_drivers d ON d.id=a.driver_id JOIN fleet_vehicles v ON v.id=a.vehicle_id JOIN projects p ON p.id=a.project_id LEFT JOIN sites s ON s.id=a.site_id
   WHERE d.user_id=$1 AND a.organization_id=$2`;
 const driverOnly:RequestHandler=(req,res,next)=>{if(req.auth?.role!=='DRIVER'){res.status(403).json(ApiResponse.error('Driver access only.','FORBIDDEN'));return;}next();};
 r.get('/driver/assignments',driverOnly,safe(async(req,res)=>{
  const a=req.auth!;res.json(ApiResponse.success({rows:(await pool.query(driverAssignments+' ORDER BY a.starts_at DESC LIMIT 500',[a.userId,a.organizationId])).rows}));
 }));
 r.get('/driver/dashboard',driverOnly,safe(async(req,res)=>{
  const a=req.auth!;
  const driver=(await pool.query('SELECT name,license_number,license_expiry,status FROM fleet_drivers WHERE user_id=$1 AND organization_id=$2',[a.userId,a.organizationId])).rows[0];
  const rows=(await pool.query(driverAssignments+' ORDER BY a.starts_at',[a.userId,a.organizationId])).rows;
  const now=Date.now(),day=new Date().toDateString();
  const upcoming=rows.filter(r=>r.status==='SCHEDULED'&&new Date(r.ends_at).getTime()>=now);
  const cards=[{label:"Today's trips",value:upcoming.filter(r=>new Date(r.starts_at).toDateString()===day).length},{label:'Upcoming trips',value:upcoming.length},{label:'Completed trips',value:rows.filter(r=>r.status==='COMPLETED').length},{label:'Licence expiry',value:driver?String(driver.license_expiry instanceof Date?driver.license_expiry.toISOString().slice(0,10):driver.license_expiry):'Not linked'}];
  const alerts:unknown[]=[];
  if(!driver) alerts.push({id:'link',notice:'Your login is not linked to a driver record yet. Ask your fleet manager to link it under Fleet > Drivers.'});
  else if(new Date(driver.license_expiry).getTime()-now<30*864e5) alerts.push({id:'licence',notice:'Your driving licence expires within 30 days. Renew it and tell your fleet manager.'});
  res.json(ApiResponse.success({cards,activity:upcoming.slice(0,8),alerts}));
 }));
 r.use('/admin',createAdminRouter());r.use('/fleet',createFleetRouter());r.use('/warehouse',createWarehouseRouter());
 return r;
}
