import type { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { hasPermission } from '../../auth/permissions';
import type { AuthContext } from '../../middleware/authenticate';
import { fail, project, uuid, text } from '../management/shared';

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
 const d = new Date(v + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v;
}, 'Use a valid calendar date');
export const quantity = z.number().finite().positive().max(999999999).multipleOf(0.001);
export const price = z.number().finite().min(0).max(999999999).multipleOf(0.01);
export const requisitionSchema = z.object({project_id:uuid,site_id:uuid, required_by_date:calendarDate, notes:z.string().max(4000).nullable().optional(), items:z.array(z.object({material_id:uuid,quantity,estimated_unit_price:price.positive()}).strict()).min(1).max(100)}).strict().refine(v=>new Set(v.items.map(i=>i.material_id)).size===v.items.length, 'Use one line per material');
export const decisionSchema = z.object({comments:z.string().trim().max(4000).nullable().optional()}).strict();
export const supplierSchema = z.object({code:text,name:text,contact_person:text,email:z.string().trim().email().max(255),phone:text,address:z.string().max(2000).nullable().optional(),status:z.enum(['ACTIVE','INACTIVE','SUSPENDED']).default('ACTIVE')}).strict();
export const quotationSchema = z.object({rfq_id:uuid,valid_until:calendarDate,lead_time_days:z.number().int().min(0).max(3650),delivery_terms:z.string().max(2000).optional(),items:z.array(z.object({requisition_item_id:uuid,quantity,unit_price:price}).strict()).min(1).max(100)}).strict().refine(v=>new Set(v.items.map(i=>i.requisition_item_id)).size===v.items.length,'Duplicate quotation lines');
export const reference = (prefix:string) => `${prefix}-${randomUUID()}`;
export const scope = (alias:string) => `${alias}.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$3 AND g.project_id=${alias}.project_id))`;
export const scopeParams = (a:AuthContext) => [a.organizationId,a.role==='ADMIN',a.userId];
export async function requireFuture(c:PoolClient,value:string) {
 if(!(await c.query('SELECT $1::date >= current_date valid',[value])).rows[0]?.valid) fail('Date must be today or later.',400);
}
export async function assignedPolicy(c:PoolClient,a:AuthContext,projectId:string,kind:'REQUISITION'|'PURCHASE_ORDER') {
 const p=(await c.query(`SELECT p.*,u.role,u.is_active FROM approval_policies p JOIN users u ON u.id=p.approver_id AND u.organization_id=p.organization_id WHERE p.organization_id=$1 AND p.project_id=$2 AND p.kind=$3 AND p.is_active FOR SHARE OF p,u`,[a.organizationId,projectId,kind])).rows[0];
 const permission=kind==='REQUISITION'?'requisition.approve':'purchase_order.approve';
 if(!p || !p.is_active || !hasPermission(p.role,permission)) fail('Configure an active authorized reviewer for this project first.',409);
 if(p.approver_id===a.userId) fail('Requester and reviewer must be different people.',403);
 await project(c,{...a,userId:p.approver_id,role:p.role},projectId);
 return p;
}
export async function supplierIdentity(c:PoolClient,a:AuthContext) {
 const row=(await c.query(`SELECT s.* FROM supplier_users su JOIN suppliers s ON s.id=su.supplier_id AND s.organization_id=su.organization_id WHERE su.user_id=$1 AND su.organization_id=$2 AND s.status='ACTIVE' FOR SHARE OF s`,[a.userId,a.organizationId])).rows[0];
 if(!row) fail('No active supplier organization is linked to this account.',403); return row;
}
export const requisitionSelect=`SELECT r.*,CASE WHEN r.status='SUBMITTED' THEN 'PENDING_APPROVAL' ELSE r.status END status,p.name project_name,u.full_name requester_name,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'material_id',i.material_id,'material_code',m.code,'material_name',m.name,'unit',m.unit,'quantity',i.quantity) ORDER BY m.name) FROM requisition_items i JOIN materials m ON m.id=i.material_id WHERE i.requisition_id=r.id),'[]'::jsonb) items
 FROM requisitions r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.requester_id`;
