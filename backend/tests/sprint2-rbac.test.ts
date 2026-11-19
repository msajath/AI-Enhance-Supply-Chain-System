import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import jwt from 'jsonwebtoken';
import { hashSync } from 'bcryptjs';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';
import { ROLES, PERMISSIONS, DASHBOARD_PREFIX, ROLE_LABELS } from '../src/auth/permissions';

const query = vi.spyOn(pool, 'query');
const password = 'Sprint2-test-only-password';
const base = { id:'b0000000-0000-0000-0000-000000000001',organization_id:'a0000000-0000-0000-0000-000000000001',email:'member@example.com',full_name:'Test Member',is_active:true,auth_version:0,password_hash:hashSync(password,4) };
const result = (rows:unknown[]) => ({rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]});
const token = (av=0) => jwt.sign({sub:base.id,av},env.JWT_SECRET,{algorithm:'HS256',issuer:env.JWT_ISSUER,audience:env.JWT_AUDIENCE,expiresIn:'5m'});
beforeEach(()=>query.mockReset());

describe('Sprint 2 roles through the existing authentication architecture',()=>{
 it.each(ROLES)('%s signs in with its server policy, without exposing secrets',async role=>{
  query.mockResolvedValue(result([{...base,role}]));
  const res=await request(createApp(new session.MemoryStore())).post('/api/v1/auth/login').send({email:base.email,password});
  expect(res.status).toBe(200);
  expect(res.body.data.user).toMatchObject({role:ROLE_LABELS[role],roleCode:role,roles:[role],permissions:PERMISSIONS[role],dashboard:`/${DASHBOARD_PREFIX[role]}/dashboard`});
  expect(res.body.data.user.password_hash).toBeUndefined();
 });
 it.each(ROLES.filter(role=>!['ADMIN','FLEET_MANAGER','WAREHOUSE_MANAGER','DRIVER','DRIVER_OPERATOR'].includes(role)))('%s has an authenticated, isolated dashboard',async role=>{
  query.mockResolvedValue(result([{...base,role}]));
  const app=createApp(new session.MemoryStore()),url=`/api/v1/${DASHBOARD_PREFIX[role]}/dashboard`;
  expect((await request(app).get(url)).status).toBe(401);
  const allowed=await request(app).get(url).auth(token(),{type:'bearer'});
  expect(allowed.status).toBe(200);expect(allowed.body.data).toMatchObject({cards:[],modulesPending:true});
  expect((await request(app).get('/api/v1/admin/users').auth(token(),{type:'bearer'})).status).toBe(403);
  query.mockResolvedValue(result([{...base,role:'ADMIN'}]));
  expect((await request(app).get(url).auth(token(),{type:'bearer'})).status).toBe(403);
 });
 it.each(['DRIVER_OPERATOR','SUPPLIER_USER','PROCUREMENT_OFFICER','AUDITOR'] as const)('%s cannot mutate stock, fleet or administrative data',async role=>{
  query.mockResolvedValue(result([{...base,role}]));const app=createApp(new session.MemoryStore());
  for(const path of ['warehouse/materials','fleet/vehicles','admin/users']) {
   expect((await request(app).post('/api/v1/'+path).auth(token(),{type:'bearer'}).send({})).status).toBe(403);
  }
 });
 it('rejects revoked credentials and disabled accounts before authorization',async()=>{
  const app=createApp(new session.MemoryStore());
  for(const user of [{...base,role:'AUDITOR',auth_version:1},{...base,role:'ADMIN',is_active:false}]) {
   query.mockResolvedValue(result([user]));
   expect((await request(app).get('/api/v1/auditor/dashboard').auth(token(),{type:'bearer'})).status).toBe(401);
  }
 });
 it('keeps procurement creation separate from approval and auditors read-only',()=>{
  expect(PERMISSIONS.PROCUREMENT_OFFICER).not.toContain('purchase_order.approve');
  expect(PERMISSIONS.PROCUREMENT_OFFICER).toContain('purchase_order.create');
  expect(PERMISSIONS.AUDITOR.every(p=>p.endsWith('.read'))).toBe(true);
 });
 it('loads the administration role catalog from the caller organization',async()=>{
  query.mockImplementation(async(sql:unknown)=>result(String(sql).includes('FROM roles')
   ? [{id:'database-role-id',role_name:'AUDITOR',description:'Read-only auditor'}]
   : [{...base,role:'ADMIN'}]));
  const res=await request(createApp(new session.MemoryStore())).get('/api/v1/admin/roles').auth(token(),{type:'bearer'});
  expect(res.status).toBe(200);
  expect(res.body.data.rows).toEqual([{id:'AUDITOR',database_id:'database-role-id',name:'Auditor',description:'Read-only auditor',permissions:PERMISSIONS.AUDITOR}]);
  expect(query.mock.calls.some(([sql,params])=>String(sql).includes('FROM roles') && (params as unknown[])[0]===base.organization_id)).toBe(true);
 });
 it.each(['DRIVER','DRIVER_OPERATOR'] as const)('%s retains user-scoped driver portal access',async role=>{
  query.mockImplementation(async(sql:unknown)=>result(String(sql).includes('FROM vehicle_assignments')
   ? [{id:'own-assignment',status:'SCHEDULED'}] : [{...base,role}]));
  const res=await request(createApp(new session.MemoryStore())).get('/api/v1/driver/assignments?user_id=another-user').auth(token(),{type:'bearer'});
  expect(res.status).toBe(200);
  expect(res.body.data.rows).toEqual([{id:'own-assignment',status:'SCHEDULED'}]);
  const call=query.mock.calls.find(([sql])=>String(sql).includes('FROM vehicle_assignments'))!;
  expect(String(call[0])).toContain('d.user_id=$1 AND a.organization_id=$2');
  expect(call[1]).toEqual([base.id,base.organization_id]);
 });
 it.each(['DRIVER_OPERATOR','SUPPLIER_USER','FINANCE_OFFICER'] as const)('%s context does not disclose unrelated resource catalogs',async role=>{
  query.mockResolvedValue(result([{...base,role}]));
  const res=await request(createApp(new session.MemoryStore())).get('/api/v1/context').auth(token(),{type:'bearer'});
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({projects:[],sites:[],warehouses:[]});
  expect(query.mock.calls.some(([sql])=>String(sql).includes('FROM warehouses'))).toBe(false);
 });
});
