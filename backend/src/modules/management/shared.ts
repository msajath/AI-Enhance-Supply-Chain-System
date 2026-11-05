import type { PoolClient } from 'pg';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { ApiResponse, AppError } from '../../utils/apiResponse';
import { PERMISSIONS } from '../../auth/permissions';
import type { AuthContext } from '../../middleware/authenticate';
export const uuid = z.string().uuid();
export const text = z.string().trim().min(1).max(255);
export const amount = z.number().finite().min(0).max(999999999).multipleOf(0.001);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v)),'Invalid date');
export const stamp = z.string().datetime({offset:true});
export const optionalId = uuid.nullable().optional();
export const fail = (message: string, status=409): never => { throw new AppError(message,status,status===403?'FORBIDDEN':'BUSINESS_RULE'); };
export const safe = (handler: (req: Request, res: Parameters<RequestHandler>[1])=>Promise<unknown>): RequestHandler => async(req,res)=>{
 try { await handler(req,res); } catch(error) {
  if(error instanceof z.ZodError) { res.status(400).json(ApiResponse.error(error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '),'INVALID_INPUT')); return; }
  if(error instanceof AppError) { res.status(error.statusCode).json(ApiResponse.error(error.message,error.errorCode)); return; }
  const code = (error as {code?:string}).code;
  if(['23505','23503','23514','22P02','22007'].includes(code??'')) { res.status(409).json(ApiResponse.error('The record conflicts with existing data or has invalid relationships.','DATA_CONFLICT')); return; }
  res.status(503).json(ApiResponse.error('This service is temporarily unavailable. Please try again.','SERVICE_UNAVAILABLE'));
 }
};
export const permit = (permission:string):RequestHandler => (req,res,next)=>{
 if(!req.auth) { res.status(401).json(ApiResponse.error('Authentication required.','UNAUTHENTICATED')); return; }
 if(!PERMISSIONS[req.auth.role].includes(permission)) { res.status(403).json(ApiResponse.error('You do not have permission to perform this action.','FORBIDDEN')); return; }
 next();
};
export async function audit(c:PoolClient,a:AuthContext,event:string,data:unknown) {
 await c.query('INSERT INTO system_audit_logs(actor_id,event_type,module,metadata) VALUES($1,$2,$3,$4)',[a.userId,event,'management',JSON.stringify({organization_id:a.organizationId,...data as object})]);
}
export async function project(c:PoolClient,a:AuthContext,id:string,active=true) {
 const r = await c.query(`SELECT p.* FROM projects p WHERE p.id=$1 AND p.organization_id=$2 AND ($3 OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.project_id=p.id AND g.user_id=$4))`,[id,a.organizationId,a.role==='ADMIN',a.userId]);
 if(!r.rows[0]) fail('Project access denied.',403);
 if(active && r.rows[0].status!=='ACTIVE') fail('Project is not active.');
 return r.rows[0];
}
export async function site(c:PoolClient,a:AuthContext,id:string,projectId?:string) {
 const r=await c.query(`SELECT s.* FROM sites s WHERE s.id=$1 AND s.organization_id=$2 AND ($3 OR EXISTS(SELECT 1 FROM user_site_access g WHERE g.site_id=s.id AND g.user_id=$4))`,[id,a.organizationId,a.role==='ADMIN',a.userId]);
 const s=r.rows[0]; if(!s) fail('Site access denied.',403);
 await project(c,a,s.project_id); if(projectId && s.project_id!==projectId) fail('Site does not belong to the selected project.');
 if(s.status!=='ACTIVE') fail('Site is not active.'); return s;
}
export async function warehouse(c:PoolClient,a:AuthContext,id:string) {
 const r=await c.query(`SELECT w.* FROM warehouses w WHERE w.id=$1 AND w.organization_id=$2 AND ($3 OR EXISTS(SELECT 1 FROM user_warehouse_access g WHERE g.warehouse_id=w.id AND g.user_id=$4))`,[id,a.organizationId,a.role==='ADMIN',a.userId]);
 const w=r.rows[0]; if(!w) fail('Warehouse access denied.',403); if(!w.is_active) fail('Warehouse is inactive.');
 if(w.site_id) await site(c,a,w.site_id); return w;
}
export const orgParams = (a:AuthContext)=>[a.organizationId,a.role==='ADMIN',a.userId];
export const projectScope = (alias:string)=>`${alias}.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.project_id=${alias}.project_id AND g.user_id=$3)) AND (${alias}.site_id IS NULL OR $2::boolean OR EXISTS(SELECT 1 FROM user_site_access sg WHERE sg.site_id=${alias}.site_id AND sg.user_id=$3))`;
export const warehouseScope=(alias:string)=>`${alias}.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_warehouse_access g WHERE g.warehouse_id=${alias}.warehouse_id AND g.user_id=$3)) AND EXISTS(SELECT 1 FROM warehouses sw WHERE sw.id=${alias}.warehouse_id AND (sw.site_id IS NULL OR $2::boolean OR EXISTS(SELECT 1 FROM user_site_access sa JOIN sites si ON si.id=sa.site_id JOIN user_project_access pa ON pa.user_id=sa.user_id AND pa.project_id=si.project_id WHERE sa.user_id=$3 AND sa.site_id=sw.site_id)))`;
export async function insert(c:PoolClient,table:string,data:Record<string,unknown>) {
 const keys=Object.keys(data); const r=await c.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,Object.values(data)); return r.rows[0];
}
export async function update(c:PoolClient,table:string,id:string,org:string,data:Record<string,unknown>) {
 const keys=Object.keys(data); if(!keys.length) fail('No changes supplied.',400);
 const r=await c.query(`UPDATE ${table} SET ${keys.map((key,i)=>`${key}=$${i+3}`).join(',')} WHERE id=$1 AND organization_id=$2 RETURNING *`,[id,org,...Object.values(data)]);
 if(!r.rows[0]) fail('Record not found.',404); return r.rows[0];
}
