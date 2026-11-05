import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../middleware/authenticate';
import { pool,withTransaction } from '../config/database';
import { ApiResponse } from '../utils/apiResponse';
import { safe,permit,uuid,text,amount,optionalId,fail,warehouse,project,site,insert,audit,warehouseScope,orgParams } from '../modules/management/shared';
const definitions:Record<string,{kind:string;permission:string}>= {
 receipts:{kind:'RECEIPT',permission:'inventory.receive'},issues:{kind:'ISSUE',permission:'inventory.issue'},transfers:{kind:'TRANSFER',permission:'inventory.transfer'},
 adjustments:{kind:'ADJUSTMENT',permission:'inventory.adjust'},counts:{kind:'COUNT',permission:'inventory.count'},returns:{kind:'RETURN',permission:'inventory.return'},
};
const documentSchema=z.object({warehouse_id:uuid,material_id:uuid,destination_id:optionalId,project_id:optionalId,site_id:optionalId,quantity:amount,rejected_quantity:amount.default(0),reason:text,reference:text,batch:z.string().max(100).optional(),condition:z.enum(['USABLE','QUARANTINED','DAMAGED']).default('USABLE')}).strict();
async function balance(c:PoolClient,a:AuthContext,w:string,m:string) {
 await c.query('INSERT INTO stock_balances(organization_id,warehouse_id,material_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[a.organizationId,w,m]);
 return (await c.query('SELECT * FROM stock_balances WHERE warehouse_id=$1 AND material_id=$2 FOR UPDATE',[w,m])).rows[0];
}
async function movement(c:PoolClient,a:AuthContext,d:Record<string,unknown>,w:string,delta:number,quarantine=0) {
 const b=await balance(c,a,w,d.material_id as string),before=Number(b.quantity),after=Math.round((before+delta)*1000)/1000;
 if(after<Number(b.reserved)||Number(b.quarantined)+quarantine<0) fail('Insufficient available stock.');
 await c.query('UPDATE stock_balances SET quantity=quantity+$3,quarantined=quarantined+$4 WHERE warehouse_id=$1 AND material_id=$2',[w,d.material_id,delta,quarantine]);
 await insert(c,'stock_movements',{organization_id:a.organizationId,warehouse_id:w,material_id:d.material_id,document_id:d.id,quantity_change:delta,quarantine_change:quarantine,before_quantity:before,after_quantity:after,actor_id:a.userId,reason:d.reason});
 return {before,after};
}
export function createWarehouseRouter() {
 const r=Router();r.use(permit('inventory.read'));
 r.get('/materials',safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query('SELECT * FROM materials WHERE organization_id=$1 ORDER BY name',[req.auth!.organizationId])).rows}))));
 // Existing material master is the only catalogue; managers may register materials here.
 r.post('/materials',permit('inventory.receive'),safe(async(req,res)=>{
  const v=z.object({code:text,name:text,unit:text,category:text,reorder_level:amount}).strict().parse(req.body),a=req.auth!;
  const row=await withTransaction(async c=>{const m=await insert(c,'materials',{...v,organization_id:a.organizationId});await audit(c,a,'MATERIAL_CREATED',{id:m.id});return m;});res.status(201).json(ApiResponse.success({row}));
 }));
 const inventorySql=`SELECT b.*,m.code,m.name,m.unit,m.category,m.reorder_level,w.name warehouse_name,b.quantity-b.reserved available_quantity,
    b.quantity-b.reserved<=m.reorder_level low_stock FROM stock_balances b JOIN materials m ON m.id=b.material_id JOIN warehouses w ON w.id=b.warehouse_id WHERE ${warehouseScope('b')}`;
 r.get('/inventory',safe(async(req,res)=>{
  if(req.query.warehouse_id) await withTransaction(c=>warehouse(c,req.auth!,uuid.parse(req.query.warehouse_id)));
  const rows=(await pool.query(inventorySql+' AND ($4::uuid IS NULL OR b.warehouse_id=$4) ORDER BY w.name,m.name',[...orgParams(req.auth!),req.query.warehouse_id??null])).rows;res.json(ApiResponse.success({rows}));
 }));
 r.get('/movements',safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(`SELECT m.*,i.name material_name,w.name warehouse_name,d.kind,d.reference,u.full_name actor FROM stock_movements m JOIN materials i ON i.id=m.material_id JOIN warehouses w ON w.id=m.warehouse_id JOIN stock_documents d ON d.id=m.document_id JOIN users u ON u.id=m.actor_id WHERE ${warehouseScope('m')} ORDER BY m.created_at DESC LIMIT 1000`,orgParams(req.auth!))).rows}))));
 r.get('/reports',safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(inventorySql+' ORDER BY w.name,m.name',orgParams(req.auth!))).rows}))));
 for(const [route,definition] of Object.entries(definitions)) {
  r.get('/'+route,safe(async(req,res)=>{
   const rows=(await pool.query(`SELECT d.*,m.name material_name,m.unit,w.name warehouse_name,dest.name destination_name,u.full_name created_by_name,d.quantity+d.rejected_quantity received_quantity,
      CASE WHEN d.kind='COUNT' THEN d.quantity-d.expected_quantity ELSE NULL END variance
      FROM stock_documents d JOIN materials m ON m.id=d.material_id JOIN warehouses w ON w.id=d.warehouse_id LEFT JOIN warehouses dest ON dest.id=d.destination_id JOIN users u ON u.id=d.created_by
      WHERE d.kind=$4 AND ((${warehouseScope('d')}) OR d.organization_id=$1 AND d.kind='TRANSFER' AND EXISTS(SELECT 1 FROM user_warehouse_access g WHERE g.warehouse_id=d.destination_id AND g.user_id=$3)) ORDER BY d.created_at DESC`,[...orgParams(req.auth!),definition.kind])).rows;
   res.json(ApiResponse.success({rows}));
  }));
  r.post('/'+route,permit(definition.permission),safe(async(req,res)=>{
   const v=documentSchema.parse(req.body),a=req.auth!;
   if(v.quantity===0&&!['COUNT','ADJUSTMENT'].includes(definition.kind)&&v.rejected_quantity===0) fail('A positive quantity is required.',400);
   if(definition.kind!=='RECEIPT' && v.rejected_quantity) fail('Rejected quantities apply only to receipts.',400);
   if(definition.kind!=='RETURN'&&v.condition!=='USABLE') fail('Specify rejected receipt quantities or use a returns/damage document.',400);
   if(definition.kind==='TRANSFER'&&!v.destination_id) fail('A destination warehouse is required.',400);
   if(definition.kind!=='TRANSFER'&&v.destination_id) fail('A destination applies only to transfers.',400);
   if(definition.kind==='ISSUE'&&!v.project_id) fail('Issues must reference an authorized project.',400);
   const row=await withTransaction(async c=>{
    await warehouse(c,a,v.warehouse_id);if(v.destination_id) await warehouse(c,a,v.destination_id);
    if(v.project_id) await project(c,a,v.project_id);if(v.site_id) await site(c,a,v.site_id,v.project_id??undefined);
    if(!(await c.query('SELECT id FROM materials WHERE id=$1 AND organization_id=$2',[v.material_id,a.organizationId])).rowCount) fail('Material access denied.',403);
    const b=await balance(c,a,v.warehouse_id,v.material_id);
    if(['ISSUE','TRANSFER'].includes(definition.kind)&&v.quantity>Number(b.quantity)-Number(b.reserved)) fail('Insufficient available stock.');
    const saved=await insert(c,'stock_documents',{...v,organization_id:a.organizationId,kind:definition.kind,status:'PENDING',created_by:a.userId,expected_quantity:Number(b.quantity)});
    await audit(c,a,'STOCK_DOCUMENT_CREATED',{id:saved.id,kind:definition.kind,reference:v.reference});return saved;
   });res.status(201).json(ApiResponse.success({row}));
  }));
  r.post('/'+route+'/:id/:action',permit(definition.permission),safe(async(req,res)=>{
   const id=uuid.parse(req.params.id),action=z.enum(['post','dispatch','receive','cancel']).parse(req.params.action),a=req.auth!;
   const row=await withTransaction(async c=>{
    const d=(await c.query('SELECT * FROM stock_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,a.organizationId])).rows[0];if(!d||d.kind!==definition.kind) fail('Document access denied.',403);
    const receiving=action==='receive';await warehouse(c,a,receiving?d.destination_id:d.warehouse_id);
    if(d.project_id) await project(c,a,d.project_id);if(d.site_id) await site(c,a,d.site_id,d.project_id);
    if(receiving && (d.kind!=='TRANSFER'||d.status!=='IN_TRANSIT')) fail('Only dispatched transfers can be received.');
    if(!receiving&&d.status!=='PENDING') fail('This document is already processed.');
    if(action==='cancel') { await c.query("UPDATE stock_documents SET status='CANCELLED',processed_by=$2,processed_at=now() WHERE id=$1",[id,a.userId]);await audit(c,a,'STOCK_CANCELLED',{id});return {...d,status:'CANCELLED'}; }
    if(d.kind==='TRANSFER' && !['dispatch','receive'].includes(action)) fail('Transfers must be dispatched and then received.');
    if(d.kind!=='TRANSFER'&&action!=='post') fail('Use post for this document.');
    let quantities:{before:number;after:number}|undefined;
    if(['ADJUSTMENT','COUNT'].includes(d.kind)) {
     const settings=(await c.query('SELECT settings FROM organizations WHERE id=$1',[a.organizationId])).rows[0].settings;
     if(settings.adjustments_require_review!==false && d.created_by===a.userId) fail('A different authorized Warehouse Manager must review and post this reconciliation.');
     const b=await balance(c,a,d.warehouse_id,d.material_id);
     if(Number(b.quantity)!==Number(d.expected_quantity)) fail('Stock changed since this document was created. Cancel it and create a new count or adjustment.');
     quantities=await movement(c,a,d,d.warehouse_id,Number(d.quantity)-Number(b.quantity));
    } else if(d.kind==='TRANSFER') {
     quantities=await movement(c,a,d,receiving?d.destination_id:d.warehouse_id,Number(d.quantity)*(receiving?1:-1));
    } else if(d.kind==='RETURN') quantities=await movement(c,a,d,d.warehouse_id,d.condition==='USABLE'?Number(d.quantity):0,d.condition==='USABLE'?0:Number(d.quantity));
    else quantities=await movement(c,a,d,d.warehouse_id,Number(d.quantity)*(d.kind==='ISSUE'?-1:1),d.kind==='RECEIPT'?Number(d.rejected_quantity):0);
    const status=d.kind==='TRANSFER'?(receiving?'RECEIVED':'IN_TRANSIT'):'POSTED';
    await c.query('UPDATE stock_documents SET status=$2,processed_by=$3,processed_at=now(),before_quantity=$4,after_quantity=$5 WHERE id=$1',[id,status,a.userId,quantities?.before,quantities?.after]);
    await audit(c,a,'STOCK_'+action.toUpperCase(),{id,kind:d.kind,status,...quantities});return {...d,status,...quantities};
   });res.json(ApiResponse.success({row}));
  }));
 }
 return r;
}
