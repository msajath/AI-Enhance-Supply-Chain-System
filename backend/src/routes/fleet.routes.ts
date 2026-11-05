import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../middleware/authenticate';
import { pool,withTransaction } from '../config/database';
import { ApiResponse } from '../utils/apiResponse';
import { safe,permit,uuid,text,amount,date,stamp,optionalId,fail,project,site,insert,update,audit,projectScope,orgParams } from '../modules/management/shared';
const vehicleSchema=z.object({project_id:uuid,site_id:optionalId,vehicle_number:text,model:text,vehicle_type:text,capacity_tons:amount,capacity_unit:z.enum(['tons','kg','m3','units']),ownership:z.enum(['OWNED','LEASED']),status:z.enum(['AVAILABLE','MAINTENANCE','INACTIVE'])}).strict();
const driverSchema=z.object({project_id:uuid,name:text,phone:z.string().trim().min(7).max(30),license_number:text,license_expiry:date,status:z.enum(['AVAILABLE','UNAVAILABLE','INACTIVE']),user_id:optionalId}).strict();
const assignmentSchema=z.object({project_id:uuid,site_id:optionalId,vehicle_id:uuid,driver_id:uuid,starts_at:stamp,ends_at:stamp,load_quantity:amount}).strict();
const maintenanceSchema=z.object({vehicle_id:uuid,description:text,scheduled_date:date,status:z.enum(['SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED']),cost:amount,next_service_date:date.nullable().optional(),next_service_mileage:amount.nullable().optional()}).strict();
async function vehicle(c:PoolClient,a:AuthContext,id:string) {
 const v=(await c.query('SELECT * FROM fleet_vehicles WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,a.organizationId])).rows[0];
 if(!v || !v.project_id) fail('Asset access denied.',403);await project(c,a,v.project_id);if(v.site_id) await site(c,a,v.site_id,v.project_id);return v;
}
export function createFleetRouter() {
 const r=Router();r.use(permit('fleet.vehicles.read'));
 for(const route of ['vehicles','equipment']) {
  const kind=route==='equipment'?'EQUIPMENT':'VEHICLE';
  r.get('/'+route,safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(`SELECT v.*, EXISTS(SELECT 1 FROM vehicle_assignments a WHERE a.vehicle_id=v.id AND a.status='SCHEDULED' AND now() BETWEEN a.starts_at AND a.ends_at) currently_assigned FROM fleet_vehicles v WHERE ${projectScope('v')} AND asset_kind=$4 ORDER BY vehicle_number`,[...orgParams(req.auth!),kind])).rows}))));
  for(const method of ['post','patch'] as const) r[method]('/'+route+(method==='patch'?'/:id':''),permit('fleet.vehicles.manage'),safe(async(req,res)=>{
   const data=vehicleSchema.parse(req.body),a=req.auth!,id=method==='patch'?uuid.parse(req.params.id):undefined;
   const row=await withTransaction(async c=>{
    await project(c,a,data.project_id);if(data.site_id) await site(c,a,data.site_id,data.project_id);
    if(id) { const old=await vehicle(c,a,id);if(old.asset_kind!==kind) fail('Asset type cannot be changed.');
     const active=await c.query("SELECT id FROM vehicle_assignments WHERE vehicle_id=$1 AND status='SCHEDULED'",[id]);
     if(active.rowCount && (data.status!=='AVAILABLE'||data.project_id!==old.project_id||data.site_id!==old.site_id||Number(data.capacity_tons)!==Number(old.capacity_tons)||data.capacity_unit!==old.capacity_unit)) fail('Complete or cancel assignments before changing availability, capacity or location.');
     const maint=await c.query("SELECT id FROM maintenance_records WHERE vehicle_id=$1 AND status='IN_PROGRESS'",[id]);if(maint.rowCount && data.status==='AVAILABLE') fail('Complete maintenance before making the asset available.');
    }
    const v=id?await update(c,'fleet_vehicles',id,a.organizationId,data):await insert(c,'fleet_vehicles',{...data,organization_id:a.organizationId,asset_kind:kind});
    await audit(c,a,'ASSET_SAVED',{id:v.id,changes:data});return v;
   });res.status(id?200:201).json(ApiResponse.success({row}));
  }));
  r.get('/'+route+'/:id/history',safe(async(req,res)=>{const a=req.auth!,id=uuid.parse(req.params.id);const rows=await withTransaction(async c=>{await vehicle(c,a,id);return (await c.query(`SELECT id,'ASSIGNMENT' kind,status,starts_at::text date FROM vehicle_assignments WHERE vehicle_id=$1 UNION ALL SELECT id,'MAINTENANCE',status,scheduled_date::text FROM maintenance_records WHERE vehicle_id=$1 ORDER BY date DESC`,[id])).rows;});res.json(ApiResponse.success({rows}));}));
 }
 r.get('/driver-accounts',permit('fleet.drivers.manage'),safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(`SELECT id,full_name,email FROM users WHERE organization_id=$1 AND role='DRIVER' AND is_active ORDER BY full_name`,[req.auth!.organizationId])).rows}))));
 r.get('/drivers',safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(`SELECT d.*,u.email login_email FROM fleet_drivers d LEFT JOIN users u ON u.id=d.user_id WHERE d.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.project_id=d.project_id AND g.user_id=$3)) ORDER BY name`,orgParams(req.auth!))).rows}))));
 for(const method of ['post','patch'] as const) r[method]('/drivers'+(method==='patch'?'/:id':''),permit('fleet.drivers.manage'),safe(async(req,res)=>{
  const data=driverSchema.parse(req.body),a=req.auth!,id=method==='patch'?uuid.parse(req.params.id):undefined;
  const row=await withTransaction(async c=>{
   await project(c,a,data.project_id);
   if(data.user_id&&!(await c.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='DRIVER' AND is_active`,[data.user_id,a.organizationId])).rowCount) fail('The login account must be an active Driver account in your organization.',400);
   if(id) {const d=(await c.query('SELECT * FROM fleet_drivers WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,a.organizationId])).rows[0];if(!d) fail('Driver access denied.',403);await project(c,a,d.project_id);
    const active=await c.query("SELECT id FROM vehicle_assignments WHERE driver_id=$1 AND status='SCHEDULED'",[id]);if(active.rowCount&&(data.status!=='AVAILABLE'||d.project_id!==data.project_id||data.license_expiry<d.license_expiry)) fail('Complete or cancel assignments before restricting the driver.');
   }
   const v=id?await update(c,'fleet_drivers',id,a.organizationId,data):await insert(c,'fleet_drivers',{...data,organization_id:a.organizationId});await audit(c,a,'DRIVER_SAVED',{id:v.id});return v;
  });res.status(id?200:201).json(ApiResponse.success({row}));
 }));
 r.get('/assignments',safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(`SELECT a.*,v.vehicle_number,d.name driver_name FROM vehicle_assignments a JOIN fleet_vehicles v ON v.id=a.vehicle_id JOIN fleet_drivers d ON d.id=a.driver_id WHERE ${projectScope('a')} ORDER BY starts_at DESC`,orgParams(req.auth!))).rows}))));
 r.post('/assignments',permit('fleet.assignments.manage'),safe(async(req,res)=>{
  const v=assignmentSchema.parse(req.body),a=req.auth!;if(new Date(v.ends_at)<=new Date(v.starts_at)) fail('End time must follow start time.',400);
  const row=await withTransaction(async c=>{
   await project(c,a,v.project_id);if(v.site_id) await site(c,a,v.site_id,v.project_id);
   const asset=await vehicle(c,a,v.vehicle_id);
   const driver=(await c.query('SELECT * FROM fleet_drivers WHERE id=$1 AND organization_id=$2 FOR UPDATE',[v.driver_id,a.organizationId])).rows[0];
   if(!driver) fail('Driver access denied.',403);await project(c,a,driver.project_id);
   if(asset.project_id!==v.project_id||driver.project_id!==v.project_id||asset.site_id&&asset.site_id!==v.site_id) fail('Assignment must match the asset and driver project/site.');
   if(asset.status!=='AVAILABLE'||driver.status!=='AVAILABLE') fail('Asset or driver is unavailable.');
   if(new Date(driver.license_expiry+'T23:59:59Z')<new Date(v.ends_at)) fail('Driver license expires before the assignment ends.');
   if(v.load_quantity>Number(asset.capacity_tons)) fail('Assignment load exceeds asset capacity.');
   const conflict=await c.query(`SELECT id FROM vehicle_assignments WHERE (vehicle_id=$1 OR driver_id=$2) AND status='SCHEDULED' AND starts_at<$4 AND ends_at>$3`,[v.vehicle_id,v.driver_id,v.starts_at,v.ends_at]);
   if(conflict.rowCount) fail('The asset or driver already has an overlapping assignment.');
   const restricted=await c.query(`SELECT id FROM maintenance_records WHERE vehicle_id=$1 AND (status='IN_PROGRESS' OR status='SCHEDULED' AND scheduled_date BETWEEN $2::timestamptz::date AND $3::timestamptz::date)`,[v.vehicle_id,v.starts_at,v.ends_at]);if(restricted.rowCount) fail('Asset has restricted maintenance during the assignment.');
   const saved=await insert(c,'vehicle_assignments',{...v,organization_id:a.organizationId,created_by:a.userId});await audit(c,a,'ASSIGNMENT_CREATED',{id:saved.id,...v});return saved;
  });res.status(201).json(ApiResponse.success({row}));
 }));
 r.post('/assignments/:id/:action',permit('fleet.assignments.manage'),safe(async(req,res)=>{
  const a=req.auth!,id=uuid.parse(req.params.id),action=z.enum(['complete','cancel']).parse(req.params.action);
  const row=await withTransaction(async c=>{const v=(await c.query('SELECT * FROM vehicle_assignments WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,a.organizationId])).rows[0];if(!v) fail('Assignment access denied.',403);await project(c,a,v.project_id);if(v.site_id) await site(c,a,v.site_id);
   if(v.status!=='SCHEDULED') fail('Assignment is already closed.');const saved=await update(c,'vehicle_assignments',id,a.organizationId,{status:action==='complete'?'COMPLETED':'CANCELLED'});await audit(c,a,'ASSIGNMENT_'+action.toUpperCase(),{id});return saved;
  });res.json(ApiResponse.success({row}));
 }));
 for(const route of ['maintenance','fuel']) r.get('/'+route,safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(`SELECT t.*,v.vehicle_number FROM ${route==='fuel'?'fuel_records':'maintenance_records'} t JOIN fleet_vehicles v ON v.id=t.vehicle_id WHERE ${projectScope('v')} ORDER BY ${route==='fuel'?'recorded_at':'scheduled_date'} DESC`,orgParams(req.auth!))).rows}))));
 for(const method of ['post','patch'] as const) r[method]('/maintenance'+(method==='patch'?'/:id':''),permit('fleet.maintenance.manage'),safe(async(req,res)=>{
  const v=maintenanceSchema.parse(req.body),a=req.auth!,id=method==='patch'?uuid.parse(req.params.id):undefined;
  const row=await withTransaction(async c=>{
   await vehicle(c,a,v.vehicle_id);
   if(id) {const old=(await c.query('SELECT * FROM maintenance_records WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,a.organizationId])).rows[0];if(!old||old.vehicle_id!==v.vehicle_id) fail('Maintenance record or asset is invalid.',403);if(['COMPLETED','CANCELLED'].includes(old.status)) fail('Closed maintenance records cannot be edited.');}
   if(['SCHEDULED','IN_PROGRESS'].includes(v.status)) {
    const clash=await c.query("SELECT id FROM vehicle_assignments WHERE vehicle_id=$1 AND status='SCHEDULED' AND (starts_at::date<=$2::date AND ends_at::date>=$2::date OR $3='IN_PROGRESS' AND ends_at>now())",[v.vehicle_id,v.scheduled_date,v.status]);if(clash.rowCount) fail('Cancel or complete conflicting assignments before restricting maintenance.');
   }
   const saved=id?await update(c,'maintenance_records',id,a.organizationId,v):await insert(c,'maintenance_records',{...v,organization_id:a.organizationId});
   await audit(c,a,'MAINTENANCE_SAVED',{id:saved.id,changes:v});return saved;
  });res.status(id?200:201).json(ApiResponse.success({row}));
 }));
 r.post('/fuel',permit('fleet.fuel.manage'),safe(async(req,res)=>{
  const v=z.object({vehicle_id:uuid,quantity:amount.positive(),unit_price:amount,odometer:amount,recorded_at:stamp}).strict().parse(req.body),a=req.auth!;
  const row=await withTransaction(async c=>{const asset=await vehicle(c,a,v.vehicle_id);if(v.odometer<Number(asset.odometer)) fail('Odometer cannot decrease.');
   const latest=(await c.query('SELECT recorded_at FROM fuel_records WHERE vehicle_id=$1 ORDER BY recorded_at DESC LIMIT 1',[v.vehicle_id])).rows[0];if(latest&&new Date(v.recorded_at)<new Date(latest.recorded_at)) fail('Fuel records must follow the latest recorded time.');if(new Date(v.recorded_at)>new Date()) fail('Fuel records cannot be in the future.');
   const saved=await insert(c,'fuel_records',{...v,organization_id:a.organizationId,created_by:a.userId});await update(c,'fleet_vehicles',asset.id,a.organizationId,{odometer:v.odometer});await audit(c,a,'FUEL_RECORDED',{id:saved.id});return saved;
  });res.status(201).json(ApiResponse.success({row}));
 }));
 r.get('/reports',permit('fleet.reports.read'),safe(async(req,res)=>{
  const rows=(await pool.query(`SELECT v.id,v.vehicle_number,v.asset_kind,v.status,v.odometer,
   (SELECT count(*)::int FROM vehicle_assignments a WHERE a.vehicle_id=v.id AND a.status='SCHEDULED') scheduled_assignments,
   (SELECT coalesce(sum(extract(epoch FROM (least(a.ends_at,now())-a.starts_at))/3600),0) FROM vehicle_assignments a WHERE a.vehicle_id=v.id AND a.status<>'CANCELLED' AND a.starts_at<now()) utilization_hours,
   (SELECT coalesce(sum(cost),0) FROM maintenance_records m WHERE m.vehicle_id=v.id AND m.status<>'CANCELLED') maintenance_cost,
   (SELECT coalesce(sum(quantity),0) FROM fuel_records f WHERE f.vehicle_id=v.id) fuel_litres,
   (SELECT coalesce(sum(total_cost),0) FROM fuel_records f WHERE f.vehicle_id=v.id) fuel_cost
   FROM fleet_vehicles v WHERE ${projectScope('v')} ORDER BY vehicle_number`,orgParams(req.auth!))).rows;res.json(ApiResponse.success({rows}));
 }));
 return r;
}
