import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';
import { date } from '../src/modules/management/shared';

const id='e0000000-0000-0000-0000-000000000001',org='a0000000-0000-0000-0000-000000000001';
const user={id:'b0000000-0000-0000-0000-000000000001',organization_id:org,role:'ADMIN',email:'admin@example.test',is_active:true,auth_version:0};
const stored={id,organization_id:org,code:'P1',name:'Project',status:'ACTIVE',start_date:'2026-01-01',end_date:'2026-12-31'};
const result=(rows:unknown[]=[])=>({rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]});
const tx=vi.fn(),release=vi.fn();
beforeEach(()=>{
 vi.spyOn(pool,'query').mockResolvedValue(result([user]));
 vi.spyOn(pool,'connect').mockResolvedValue({query:tx,release} as never);
 tx.mockReset(); tx.mockImplementation(async(sql:string)=>result(sql.startsWith('SELECT * FROM projects')?[stored]:sql.startsWith('SELECT * FROM sites')?[{id,organization_id:org,project_id:id,code:'S1',name:'Site',status:'ACTIVE',address:null}]:sql.startsWith('UPDATE')?[{...stored,name:'Renamed'}]:sql.startsWith('SELECT id FROM projects')?[{id}]:[]));
});
const token=()=>jwt.sign({sub:user.id,av:0},env.JWT_SECRET,{algorithm:'HS256',issuer:env.JWT_ISSUER,audience:env.JWT_AUDIENCE,expiresIn:'1m'});
const patch=(route:string,body:unknown)=>request(createApp(new session.MemoryStore())).patch('/api/v1/admin/'+route+'/'+id).auth(token(),{type:'bearer'}).send(body as object);

describe('strict calendar dates',()=>{
 it.each(['2026-02-30','2026-04-31','2027-02-29','2026-13-01','1900-02-29','0000-01-01','2026-2-01'])('rejects %s',v=>expect(date.safeParse(v).success).toBe(false));
 it.each(['2028-02-29','2026-12-31','2000-02-29'])('accepts %s',v=>expect(date.safeParse(v).success).toBe(true));
});
describe('validated partial master-data updates',()=>{
 it.each([{name:'Renamed'},{status:'ON_HOLD'},{end_date:'2027-01-01'},stored])('accepts project partial/full input %j',async body=>{
  const {id:_id,organization_id:_org,...payload}=body as typeof stored;
  expect((await patch('projects',payload)).status).toBe(200);
  expect(tx.mock.calls.some(([sql])=>String(sql).includes('FOR UPDATE'))).toBe(true);
 });
 it('rejects final ordering using the stored other date, and rolls back',async()=>{
  expect((await patch('projects',{end_date:'2025-12-31'})).status).toBe(400);
  expect(tx.mock.calls.some(([sql])=>String(sql).startsWith('UPDATE'))).toBe(false);
  expect(tx.mock.calls.some(([sql])=>sql==='ROLLBACK')).toBe(true);
 });
 it('allows an explicitly cleared nullable date',async()=>expect((await patch('projects',{end_date:null})).status).toBe(200));
 it('accepts stored PostgreSQL Date values',async()=>{
  tx.mockImplementation(async(sql:string)=>result(sql.startsWith('SELECT * FROM projects')?[{...stored,start_date:new Date('2026-01-01T00:00:00Z')}]:sql.startsWith('UPDATE')?[stored]:[]));
  expect((await patch('projects',{name:'Renamed'})).status).toBe(200);
 });
 it('accepts partial site details',async()=>expect((await patch('sites',{address:'New site address'})).status).toBe(200));
 it.each([{}, {unexpected:'value'}, {start_date:'2026-02-30'}])('rejects invalid input %j',async body=>expect((await patch('projects',body)).status).toBe(400));
 it('retains create validation',async()=>{
  expect((await request(createApp(new session.MemoryStore())).post('/api/v1/admin/projects').auth(token(),{type:'bearer'}).send({name:'Only a name'})).status).toBe(400);
 });
 it('denies an ordinary user before opening a transaction',async()=>{
  vi.mocked(pool.query).mockResolvedValue(result([{...user,role:'WAREHOUSE_MANAGER'}]));
  expect((await patch('projects',{name:'Renamed'})).status).toBe(403);
  expect(tx).not.toHaveBeenCalled();
 });
});
