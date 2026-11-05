import { Router } from 'express';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { pool, withTransaction } from '../config/database';
import { ApiResponse } from '../utils/apiResponse';
import { PERMISSIONS, ROLES, ROLE_LABELS } from '../auth/permissions';
import { safe, permit, uuid, text, date, optionalId, amount, fail, insert, update, audit, site } from '../modules/management/shared';

const password=z.string().min(12).max(72).refine(v=>Buffer.byteLength(v)<=72,'Maximum 72 password bytes');
const userSchema=z.object({email:z.string().trim().email().max(255).transform(v=>v.toLowerCase()),full_name:text,role:z.enum(ROLES),is_active:z.boolean().default(true),password:password.optional()}).strict();
const definitions = {
 projects:{table:'projects',permission:'projects.manage',schema:z.object({code:text,name:text,status:z.enum(['PLANNED','ACTIVE','ON_HOLD','COMPLETED','CANCELLED']),start_date:date.nullable().optional(),end_date:date.nullable().optional()}).strict()},
 sites:{table:'sites',permission:'sites.manage',schema:z.object({project_id:uuid,code:text,name:text,address:z.string().max(2000).nullable().optional(),status:z.enum(['ACTIVE','INACTIVE','CLOSED'])}).strict()},
 warehouses:{table:'warehouses',permission:'warehouses.manage',schema:z.object({code:text,name:text,location:text,capacity:amount,warehouse_type:z.enum(['CENTRAL','REGIONAL','SITE']),site_id:optionalId,is_active:z.boolean()}).strict()},
} as const;
export function createAdminRouter() {
 const r=Router();
 r.use(permit('users.read'));
 r.get('/roles',safe(async(_req,res)=>res.json(ApiResponse.success({rows:ROLES.map(role=>({id:role,name:ROLE_LABELS[role],permissions:PERMISSIONS[role]}))}))));
 r.get('/users',safe(async(req,res)=>{
  const users=await pool.query(`SELECT id,email,full_name,role,is_active,created_at,
    ARRAY(SELECT project_id FROM user_project_access WHERE user_id=u.id) project_ids,
    ARRAY(SELECT warehouse_id FROM user_warehouse_access WHERE user_id=u.id) warehouse_ids,
    ARRAY(SELECT site_id FROM user_site_access WHERE user_id=u.id) site_ids FROM users u WHERE organization_id=$1 ORDER BY full_name`,[req.auth!.organizationId]);
  res.json(ApiResponse.success({rows:users.rows.map(u=>({...u,permissions:PERMISSIONS[u.role as keyof typeof PERMISSIONS]??[]}))}));
 }));
 r.post('/users',permit('users.create'),safe(async(req,res)=>{
  const v=userSchema.parse(req.body); if(!v.password) fail('A password of at least 12 characters is required.',400);
  const a=req.auth!;
  const row=await withTransaction(async c=>{
   const {password:secret,...data}=v;
   const u=await insert(c,'users',{...data,organization_id:a.organizationId,password_hash:await hash(secret!,12)});
   await audit(c,a,'USER_CREATED',{user_id:u.id,role:u.role}); delete u.password_hash; return u;
  }); res.status(201).json(ApiResponse.success({row}));
 }));
 r.patch('/users/:id',permit('users.update'),safe(async(req,res)=>{
  const id=uuid.parse(req.params.id),v=userSchema.omit({password:true}).partial().strict().parse(req.body),a=req.auth!;
  const row=await withTransaction(async c=>{
   await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[a.organizationId]);
   const old=(await c.query('SELECT id,role,is_active FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,a.organizationId])).rows[0];
   if(!old) fail('User not found.',404);
   if(id===a.userId && (v.role && v.role!==old.role || v.is_active===false)) fail('You cannot change your own role or deactivate your own account.');
   if(old.role==='ADMIN' && old.is_active && (v.role && v.role!=='ADMIN' || v.is_active===false)) {
    const count=await c.query(`SELECT count(*)::int n FROM users WHERE organization_id=$1 AND role='ADMIN' AND is_active`,[a.organizationId]);
    if(count.rows[0].n<=1) fail('The last active administrator must be retained.');
   }
   const u=await update(c,'users',id,a.organizationId,v);
   // Revoke old sessions whenever identity, role or activation changes.
   await c.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[id]);
   await audit(c,a,'USER_UPDATED',{user_id:id,before:old,after:v}); delete u.password_hash; return u;
  });res.json(ApiResponse.success({row}));
 }));
 r.post('/users/:id/password',permit('users.update'),safe(async(req,res)=>{
  const id=uuid.parse(req.params.id),v=z.object({password}).strict().parse(req.body),a=req.auth!;
  await withTransaction(async c=>{ const row=await update(c,'users',id,a.organizationId,{password_hash:await hash(v.password,12)}); await c.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[id]); await audit(c,a,'PASSWORD_RESET',{user_id:row.id}); });
  res.json(ApiResponse.success(null,'Password reset; previous sessions revoked.'));
 }));
 r.put('/users/:id/access',permit('users.update'),safe(async(req,res)=>{
  const id=uuid.parse(req.params.id),a=req.auth!,v=z.object({project_ids:z.array(uuid),site_ids:z.array(uuid),warehouse_ids:z.array(uuid)}).strict().parse(req.body);
  await withTransaction(async c=>{
   if(!(await c.query('SELECT id FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,a.organizationId])).rowCount) fail('User not found.',404);
   for(const [ids,table] of [[v.project_ids,'projects'],[v.site_ids,'sites'],[v.warehouse_ids,'warehouses']] as const) {
    const count=await c.query(`SELECT count(*)::int n FROM ${table} WHERE organization_id=$1 AND id=ANY($2::uuid[])`,[a.organizationId,ids]);
    if(count.rows[0].n!==new Set(ids).size) fail('Access assignments must belong to your organization.',403);
   }
   const sites=await c.query('SELECT project_id FROM sites WHERE id=ANY($1::uuid[])',[v.site_ids]);
   if(sites.rows.some(s=>!v.project_ids.includes(s.project_id))) fail('Site assignments require the related project assignment.');
   const wh=await c.query('SELECT site_id FROM warehouses WHERE id=ANY($1::uuid[])',[v.warehouse_ids]);
   if(wh.rows.some(w=>w.site_id && !v.site_ids.includes(w.site_id))) fail('Site warehouses require the related site assignment.');
   for(const [ids,table,column] of [[v.project_ids,'user_project_access','project_id'],[v.site_ids,'user_site_access','site_id'],[v.warehouse_ids,'user_warehouse_access','warehouse_id']] as const) {
    await c.query(`DELETE FROM ${table} WHERE user_id=$1`,[id]);
    for(const resource of new Set(ids)) await c.query(`INSERT INTO ${table}(user_id,${column},organization_id) VALUES($1,$2,$3)`,[id,resource,a.organizationId]);
   }
   await audit(c,a,'ACCESS_ASSIGNED',{user_id:id,...v});
  });res.json(ApiResponse.success(null));
 }));
 for(const [route,d] of Object.entries(definitions)) {
  r.get('/'+route,safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(`SELECT * FROM ${d.table} WHERE organization_id=$1 ORDER BY name`,[req.auth!.organizationId])).rows}))));
  for(const method of ['post','patch'] as const) r[method]('/'+route+(method==='patch'?'/:id':''),permit(d.permission),safe(async(req,res)=>{
   const v=d.schema.parse(req.body),a=req.auth!,id=method==='patch'?uuid.parse(req.params.id):undefined;
   const row=await withTransaction(async c=>{
    if('start_date' in v && v.start_date && v.end_date && v.end_date<v.start_date) fail('Project end date cannot precede its start date.',400);
    if('project_id' in v && !(await c.query('SELECT id FROM projects WHERE id=$1 AND organization_id=$2',[v.project_id,a.organizationId])).rowCount) fail('Project access denied.',403);
    if('warehouse_type' in v && ((v.warehouse_type==='SITE')!==Boolean(v.site_id))) fail('SITE warehouses require a site; central and regional warehouses must not have one.',400);
    if('site_id' in v && v.site_id) await site(c,a,v.site_id);
    const saved=id?await update(c,d.table,id,a.organizationId,v):await insert(c,d.table,{...v,organization_id:a.organizationId});
    await audit(c,a,`${route.toUpperCase()}_${id?'UPDATED':'CREATED'}`,{id:saved.id,changes:v});return saved;
   });res.status(id?200:201).json(ApiResponse.success({row}));
  }));
 }
 r.get('/audit',safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query(`SELECT l.id,l.event_type,l.module,l.metadata,l.created_at,u.full_name actor FROM system_audit_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE u.organization_id=$1::uuid OR l.metadata->>'organization_id'=$1::text ORDER BY l.created_at DESC LIMIT 1000`,[req.auth!.organizationId])).rows}))));
 r.get('/settings',safe(async(req,res)=>res.json(ApiResponse.success({rows:(await pool.query('SELECT id,name,code,address,settings FROM organizations WHERE id=$1',[req.auth!.organizationId])).rows}))));
 r.patch('/settings/:id',permit('settings.manage'),safe(async(req,res)=>{
  const v=z.object({name:text,address:z.string().max(2000),settings:z.object({adjustments_require_review:z.literal(true)}).optional()}).strict().parse(req.body),a=req.auth!;
  if(req.params.id!==a.organizationId) fail('Organization access denied.',403);
  const row=await withTransaction(async c=>{const u=(await c.query('UPDATE organizations SET name=$1,address=$2 WHERE id=$3 RETURNING id,name,code,address,settings',[v.name,v.address,a.organizationId])).rows[0];await audit(c,a,'ORGANIZATION_UPDATED',{changes:v});return u;});res.json(ApiResponse.success({row}));
 }));
 return r;
}
