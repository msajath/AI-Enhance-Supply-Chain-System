import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID, randomBytes } from 'crypto';
import { hash, compare } from 'bcryptjs';
import request from 'supertest';
import session from 'express-session';
import jwt from 'jsonwebtoken';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { ROLES, DASHBOARD_PREFIX, type Role } from '../src/auth/permissions';
import { assertScopeTestDatabase } from './helpers/testDatabaseGuard';

/** Approved synthetic fixtures are retained for review, never cleaned out of a working database. */
describe.skipIf(process.env.ROLE_ACCEPTANCE_INTEGRATION!=='1')('role acceptance on the approved isolated PostgreSQL database',()=>{
 const run=randomUUID(),org=randomUUID(),project=randomUUID(),otherProject=randomUUID(),site=randomUUID(),warehouse=randomUUID();
 const accounts={} as Record<Role,{id:string;email:string;password:string}>;
 const app=createApp(new session.MemoryStore());
 const resultToken=(role:Role)=>jwt.sign({sub:accounts[role].id,av:0},env.JWT_SECRET,{algorithm:'HS256',issuer:env.JWT_ISSUER,audience:env.JWT_AUDIENCE,expiresIn:'5m'});
 const call=(role:Role,path:string)=>request(app).get('/api/v1/'+path).auth(resultToken(role),{type:'bearer'});
 beforeAll(async()=>{
  await assertScopeTestDatabase(pool,{...process.env,SCOPE_INTEGRATION:process.env.ROLE_ACCEPTANCE_INTEGRATION},env.DB_NAME);
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query('INSERT INTO organizations(id,code,name) VALUES($1,$2,$3)',[org,'V-'+run,'Synthetic Role Verification']);
   for(const [id,code] of [[project,'V-P1'],[otherProject,'V-P2']]) await c.query('INSERT INTO projects(id,organization_id,code,name) VALUES($1,$2,$3,$4)',[id,org,code,code]);
   await c.query('INSERT INTO sites(id,organization_id,project_id,code,name) VALUES($1,$2,$3,$4,$5)',[site,org,project,'V-S1','Verification Site']);
   await c.query("INSERT INTO warehouses(id,organization_id,code,name,location,warehouse_type,site_id) VALUES($1,$2,'V-W1','Verification Store','Synthetic location','SITE',$3)",[warehouse,org,site]);
   for(const role of ROLES){
    const account={id:randomUUID(),email:role.toLowerCase()+'@'+run+'.verification.test',password:randomBytes(18).toString('base64url')}; accounts[role]=account;
    await c.query('INSERT INTO users(id,organization_id,email,password_hash,full_name,role) VALUES($1,$2,$3,$4,$5,$6)',[account.id,org,account.email,await hash(account.password,12),'Verification '+role,role]);
    if(!['ADMIN','DRIVER','DRIVER_OPERATOR','SUPPLIER_USER'].includes(role)){
     await c.query('INSERT INTO user_project_access(user_id,project_id,organization_id) VALUES($1,$2,$3)',[account.id,project,org]);
     await c.query('INSERT INTO user_site_access(user_id,site_id,organization_id) VALUES($1,$2,$3)',[account.id,site,org]);
    }
    if(['WAREHOUSE_MANAGER','SITE_STOREKEEPER','SUPPLY_CHAIN_MANAGER','AUDITOR'].includes(role))await c.query('INSERT INTO user_warehouse_access(user_id,warehouse_id,organization_id) VALUES($1,$2,$3)',[account.id,warehouse,org]);
   }
   for(let i=1;i<=21;i++)await c.query('INSERT INTO materials(organization_id,code,name,unit,category,reorder_level) VALUES($1,$2,$3,$4,$5,$6)',[org,'V-M'+String(i).padStart(2,'0'),'Synthetic construction material '+i,'units',['Concrete','Steel','Timber'][i%3],10]);
   await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 },30000);
 afterAll(async()=>{await pool.end();});

 it.each(ROLES)('%s logs in using a real hash and reaches only its assigned workspace',async role=>{
  const account=accounts[role];
  const login=await request(app).post('/api/v1/auth/login').send({email:account.email,password:account.password});
  expect(login.status).toBe(200);expect(login.body.data.user.roleCode).toBe(role);
  expect(login.body.data.user.dashboard).toBe('/'+DASHBOARD_PREFIX[role]+'/dashboard');
  expect((await call(role,DASHBOARD_PREFIX[role]+'/dashboard')).status).toBe(200);
  if(role!=='ADMIN')expect((await call(role,'admin/users')).status).toBe(403);
 });
 it('returns 21 genuine scoped material records across three categories',async()=>{
  const response=await call('WAREHOUSE_MANAGER','warehouse/materials');
  expect(response.status).toBe(200);expect(response.body.data.rows).toHaveLength(21);
  expect(new Set(response.body.data.rows.map((r:{category:string})=>r.category)).size).toBe(3);
 });
 it('records costs and budget transactionally, exports real totals and denies ungranted projects',async()=>{
  const base=request(app);
  const cost=await base.post('/api/v1/reports/costs').auth(resultToken('ADMIN'),{type:'bearer'}).send({project_id:project,cost_type:'TRANSPORT',amount:1250.50,currency:'LKR',incurred_on:'2026-11-27',reference:'V-COST-'+run,evidence_reference:'SYNTHETIC-'+run,description:'Fictional transport test cost'});
  expect(cost.status).toBe(201);
  const budget=await request(app).put('/api/v1/reports/budgets').auth(resultToken('ADMIN'),{type:'bearer'}).send({project_id:project,amount:2000,currency:'LKR',period_start:'2026-11-01',period_end:'2026-11-30'});
  expect(budget.status).toBe(200);
  const report=await call('FINANCE_OFFICER','reports/costs?from=2026-11-01&to=2026-11-30&project_id='+project);
  expect(report.status).toBe(200);expect(report.body.data.rows).toHaveLength(1);
  const csv=await call('FINANCE_OFFICER','reports/costs/export?from=2026-11-01&to=2026-11-30&project_id='+project);
  expect(csv.status).toBe(200);expect(csv.body.data.csv.includes('1250.50')).toBe(true);
  expect((await call('FINANCE_OFFICER','reports/costs?from=2026-11-01&to=2026-11-30&project_id='+otherProject)).status).toBe(403);
  expect((await request(app).post('/api/v1/reports/costs').auth(resultToken('FINANCE_OFFICER'),{type:'bearer'}).send({})).status).toBe(403);
 });
 it('delivers actual SMTP recovery, hashes passwords, rejects replay and revokes existing credentials',async()=>{
  if(process.env.PASSWORD_RESET_ENABLED!=='true'||process.env.SMTP_HOST!=='127.0.0.1'||process.env.SMTP_PORT!=='11025')throw Error('Requires approved loopback Mailpit configuration');
  const account=accounts.FINANCE_OFFICER,resetApp=createApp(new session.MemoryStore());
  const old=await request(resetApp).post('/api/v1/auth/login').send({email:account.email,password:account.password});
  expect(old.status).toBe(200);
  const cookie=old.headers['set-cookie'][0].split(';')[0];
  const generic=await request(resetApp).post('/api/v1/auth/forgot-password').send({email:account.email});
  expect(generic.status).toBe(202);
  let raw='';
  for(let attempt=0;attempt<40&&!raw;attempt++){
   const list=await (await fetch('http://127.0.0.1:18025/api/v1/messages')).json() as {messages:{ID:string;To:{Address:string}[]}[]};
   const match=list.messages.find(m=>m.To.some(to=>to.Address===account.email));
   if(match){const mail=await (await fetch('http://127.0.0.1:18025/api/v1/message/'+match.ID)).json() as {Text:string;HTML:string};
    expect(mail.Text.includes(account.password)).toBe(false);raw=mail.Text.match(/#token=([a-f0-9]{64})/)?.[1]??'';
   }
   if(!raw)await new Promise(resolve=>setTimeout(resolve,100));
  }
  expect(Boolean(raw)).toBe(true);
  const next=randomBytes(18).toString('base64url');
  expect((await request(resetApp).post('/api/v1/auth/reset-password').send({token:raw,newPassword:next,confirmPassword:next})).status).toBe(200);
  expect((await request(resetApp).post('/api/v1/auth/reset-password').send({token:raw,newPassword:next,confirmPassword:next})).status).toBe(400);
  expect((await request(resetApp).get('/api/v1/auth/me').set('Cookie',cookie)).status).toBe(401);
  expect((await request(resetApp).get('/api/v1/reports/projects').auth(resultToken('FINANCE_OFFICER'),{type:'bearer'})).status).toBe(401);
  expect((await request(resetApp).post('/api/v1/auth/login').send({email:account.email,password:account.password})).status).toBe(401);
  expect((await request(resetApp).post('/api/v1/auth/login').send({email:account.email,password:next})).status).toBe(200);
  const saved=(await pool.query('SELECT password_hash,role FROM users WHERE id=$1',[account.id])).rows[0];
  expect(await compare(next,saved.password_hash)).toBe(true);expect(saved.role).toBe('FINANCE_OFFICER');
 },15000);
});
