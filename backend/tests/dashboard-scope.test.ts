import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';

const id='b0000000-0000-0000-0000-000000000001',org='a0000000-0000-0000-0000-000000000001',scope='e0000000-0000-0000-0000-000000000001';
const user={id,organization_id:org,email:'test@example.test',role:'FLEET_MANAGER',is_active:true,auth_version:0};
const result=(rows:unknown[])=>({rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]});
const query=vi.spyOn(pool,'query'),tx=vi.fn();
beforeEach(()=>{
 query.mockReset(); tx.mockReset();
 query.mockImplementation(async(sql:unknown)=>result(String(sql).includes('FROM users WHERE id')?[user]:[]));
 vi.spyOn(pool,'connect').mockResolvedValue({query:tx,release:vi.fn()} as never);
 tx.mockImplementation(async(sql:string)=>result(sql.startsWith('SELECT p.')?[{id:scope,status:'ACTIVE'}]:sql.startsWith('SELECT w.')?[{id:scope,is_active:true,site_id:null}]:[]));
});
const get=(route:string)=>request(createApp(new session.MemoryStore())).get('/api/v1/'+route).auth(jwt.sign({sub:id,av:0},env.JWT_SECRET,{algorithm:'HS256',issuer:env.JWT_ISSUER,audience:env.JWT_AUDIENCE,expiresIn:'1m'}),{type:'bearer'});
describe('dashboard scope is validated and applied on the server',()=>{
 it('constrains every fleet metric query to an authorized selected project',async()=>{
  expect((await get('fleet/dashboard?project_id='+scope)).status).toBe(200);
  const metrics=query.mock.calls.filter(([sql])=>!String(sql).includes('FROM users WHERE id'));
  expect(metrics).toHaveLength(3);
  for(const [sql,params] of metrics){expect(sql).toContain('.project_id=$4');expect(params).toEqual([org,false,id,scope]);}
 });
 it('denies out-of-scope projects before fetching metrics',async()=>{
  tx.mockResolvedValue(result([]));
  expect((await get('fleet/dashboard?project_id='+scope)).status).toBe(403);
  expect(query.mock.calls.filter(([sql])=>!String(sql).includes('FROM users WHERE id'))).toHaveLength(0);
 });
 it.each(['project_id=not-a-uuid','warehouse_id='+scope,'project_id='+scope+'&unexpected=1'])('rejects invalid fleet filters: %s',async filter=>{
  expect((await get('fleet/dashboard?'+filter)).status).toBe(400);
  expect(tx).not.toHaveBeenCalled();
 });
 it('constrains warehouse metrics to a permitted warehouse',async()=>{
  query.mockImplementation(async(sql:unknown)=>result(String(sql).includes('FROM users WHERE id')?[{...user,role:'WAREHOUSE_MANAGER'}]:[]));
  expect((await get('warehouse/dashboard?warehouse_id='+scope)).status).toBe(200);
  const metrics=query.mock.calls.filter(([sql])=>!String(sql).includes('FROM users WHERE id'));
  expect(metrics).toHaveLength(3);
  for(const [sql,params] of metrics){expect(sql).toContain('.warehouse_id=$4');expect(params).toEqual([org,false,id,scope]);}
 });
});
