import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import request,{type SuperAgentTest} from 'supertest';
import {randomUUID} from 'crypto';
import {hash} from 'bcryptjs';
import {pool} from '../src/config/database';
import {env} from '../src/config/env';
import {createApp} from '../src/app';
const enabled=process.env.MANAGEMENT_INTEGRATION==='1';
describe.skipIf(!enabled)('three-role workflows against real PostgreSQL',()=>{
 const org=randomUUID(),foreignOrg=randomUUID(),adminId=randomUUID(),password='Integration-only-password!',suffix=randomUUID().slice(0,8);
 const app=createApp();const admin=request.agent(app),fleet=request.agent(app),wm=request.agent(app),reviewer=request.agent(app),limited=request.agent(app);
 const ids:Record<string,string>={};const email=(name:string)=>`${name}-${suffix}@example.com`;
 const post=async(agent:SuperAgentTest,path:string,body:unknown,status=201)=>{const r=await agent.post('/api/v1/'+path).send(body);expect({status:r.status,body:r.body.error}).toEqual({status,body:status>=400?expect.any(Object):undefined});return r.body.data?.row;};
 const action=async(agent:SuperAgentTest,path:string,status=200)=>post(agent,path,{},status);
 beforeAll(async()=>{
  if(env.DB_NAME!=='qorvenz_management_test')throw new Error('Use the dedicated qorvenz_management_test database. Run all migrations first.');
  await pool.query('INSERT INTO organizations(id,name,code) VALUES($1,$2,$3),($4,$5,$6)',[org,'Integration Construction','IT-'+suffix,foreignOrg,'Other tenant','OTHER-'+suffix]);
  await pool.query('INSERT INTO users(id,organization_id,email,full_name,role,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[adminId,org,email('admin'),'Integration Admin','ADMIN',await hash(password,12)]);
  expect((await admin.post('/api/v1/auth/login').send({email:email('admin'),password})).status).toBe(200);
 },15000);
 afterAll(async()=>{await pool.end();});
 it('Admin creates projects, sites, warehouses and all role accounts, then assigns scope',async()=>{
  ids.project=(await post(admin,'admin/projects',{code:'P1',name:'Bridge Works',status:'ACTIVE'})).id;
  ids.project2=(await post(admin,'admin/projects',{code:'P2',name:'Second Works',status:'ACTIVE'})).id;
  ids.site=(await post(admin,'admin/sites',{project_id:ids.project,code:'S1',name:'River Site',status:'ACTIVE',address:'Fictional river road'})).id;
  const wh={location:'Test location',capacity:10000,warehouse_type:'CENTRAL',is_active:true};
  ids.source=(await post(admin,'admin/warehouses',{...wh,code:'W1',name:'Source Store'})).id;ids.dest=(await post(admin,'admin/warehouses',{...wh,code:'W2',name:'Destination Store'})).id;
  for(const [name,role,agent]of [['fleet','FLEET_MANAGER',fleet],['warehouse','WAREHOUSE_MANAGER',wm],['reviewer','WAREHOUSE_MANAGER',reviewer],['limited','WAREHOUSE_MANAGER',limited]] as const){
   ids[name]=(await post(admin,'admin/users',{email:email(name),full_name:name+' Manager',role,password,is_active:true})).id;
   const access=await admin.put('/api/v1/admin/users/'+ids[name]+'/access').send({project_ids:[ids.project],site_ids:[ids.site],warehouse_ids:name==='fleet'?[]:name==='limited'?[ids.dest]:[ids.source,ids.dest]});expect(access.status).toBe(200);
   const login=await agent.post('/api/v1/auth/login').send({email:email(name),password});expect(login.status).toBe(200);expect(login.body.data.user.password_hash).toBeUndefined();
  }
  expect((await pool.query('SELECT role FROM users WHERE id=$1',[ids.fleet])).rows[0].role).toBe('FLEET_MANAGER');
  const audit=await admin.get('/api/v1/admin/audit');expect(audit.status).toBe(200);expect(audit.body.data.rows.some((r:{event_type:string})=>r.event_type==='ACCESS_ASSIGNED')).toBe(true);
 });
 it('serves the three dashboards, scoped context, roles and settings',async()=>{
  for(const [agent,role]of [[admin,'admin'],[fleet,'fleet'],[wm,'warehouse']]as const){const d=await agent.get('/api/v1/'+role+'/dashboard');expect(d.status).toBe(200);expect(d.body.data.cards).toHaveLength(4);expect((await agent.get('/api/v1/context')).status).toBe(200);expect((await agent.get('/api/v1/auth/me')).status).toBe(200);}
  const roles=await admin.get('/api/v1/admin/roles');expect(roles.body.data.rows).toHaveLength(3);
  expect((await admin.get('/api/v1/admin/settings')).status).toBe(200);
 });
 it('denies other-role APIs, cookie tampering, expired tokens and public Admin signup',async()=>{
  expect((await fleet.get('/api/v1/admin/users')).status).toBe(403);expect((await wm.get('/api/v1/fleet/vehicles')).status).toBe(403);expect((await admin.get('/api/v1/warehouse/inventory')).status).toBe(403);
  expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);
  expect((await request(app).get('/api/v1/auth/me').set('Cookie','qorvenz.sid=forged')).status).toBe(401);
  await post(request.agent(app),'auth/signup',{email:email('attack'),fullName:'Attack User',password,role:'ADMIN'},403);
 });
 it('validates relationships and prohibits cross-organization access grants',async()=>{
  const foreign=(await pool.query('INSERT INTO projects(organization_id,code,name) VALUES($1,$2,$3) RETURNING id',[foreignOrg,'FOREIGN','Other tenant project'])).rows[0].id;
  expect((await admin.put('/api/v1/admin/users/'+ids.fleet+'/access').send({project_ids:[foreign],site_ids:[],warehouse_ids:[]})).status).toBe(403);
  await post(admin,'admin/sites',{project_id:foreign,code:'BAD',name:'Forbidden',status:'ACTIVE'},403);
  await post(admin,'admin/warehouses',{code:'BAD',name:'Invalid warehouse',location:'Test',capacity:1,warehouse_type:'SITE',site_id:null,is_active:true},400);
  expect((await admin.patch('/api/v1/admin/users/'+adminId).send({role:'FLEET_MANAGER'})).status).toBe(409);
  expect((await admin.patch('/api/v1/admin/users/'+adminId).send({is_active:false})).status).toBe(409);
 });
 it('creates, updates and validates fleet assets and drivers within project scope',async()=>{
  const asset={project_id:ids.project,site_id:ids.site,vehicle_number:'VEH-'+suffix,model:'Tipper',vehicle_type:'TRUCK',capacity_tons:10,capacity_unit:'tons',ownership:'OWNED',status:'AVAILABLE'};
  ids.vehicle=(await post(fleet,'fleet/vehicles',asset)).id;
  expect((await fleet.patch('/api/v1/fleet/vehicles/'+ids.vehicle).send({...asset,model:'Tipper updated'})).status).toBe(200);
  await post(fleet,'fleet/vehicles',asset,409);
  await post(fleet,'fleet/vehicles',{...asset,vehicle_number:'OTHER-'+suffix,project_id:ids.project2},403);
  ids.equipment=(await post(fleet,'fleet/equipment',{...asset,vehicle_number:'EQ-'+suffix,model:'Forklift',vehicle_type:'FORKLIFT'})).id;
  ids.driver=(await post(fleet,'fleet/drivers',{project_id:ids.project,name:'Test Driver',phone:'0712345678',license_number:'LIC-'+suffix,license_expiry:'2035-12-31',status:'AVAILABLE'})).id;
  expect((await fleet.get('/api/v1/fleet/vehicles')).body.data.rows).toHaveLength(1);expect((await fleet.get('/api/v1/fleet/equipment')).body.data.rows).toHaveLength(1);expect((await fleet.get('/api/v1/fleet/drivers')).status).toBe(200);
 });
 const booking=()=>({project_id:ids.project,site_id:ids.site,vehicle_id:ids.vehicle,driver_id:ids.driver,starts_at:'2027-01-10T09:00:00Z',ends_at:'2027-01-10T12:00:00Z',load_quantity:5});
 it('prevents concurrent bookings and capacity violations, and preserves completed assignments',async()=>{
  await post(fleet,'fleet/assignments',{...booking(),load_quantity:11},409);
  const responses=await Promise.all([fleet.post('/api/v1/fleet/assignments').send(booking()),fleet.post('/api/v1/fleet/assignments').send(booking())]);
  expect(responses.map(r=>r.status).sort()).toEqual([201,409]);ids.assignment=responses.find(r=>r.status===201)!.body.data.row.id;
  await action(fleet,'fleet/assignments/'+ids.assignment+'/complete');await action(fleet,'fleet/assignments/'+ids.assignment+'/cancel',409);
  expect((await fleet.get('/api/v1/fleet/vehicles/'+ids.vehicle+'/history')).body.data.rows.length).toBeGreaterThan(0);
 });
 it('restricts maintenance bookings, records costs and checks fuel odometer progression',async()=>{
  ids.maintenance=(await post(fleet,'fleet/maintenance',{vehicle_id:ids.vehicle,description:'Preventive service',scheduled_date:'2027-01-10',status:'IN_PROGRESS',cost:200})).id;
  await post(fleet,'fleet/assignments',booking(),409);
  expect((await fleet.patch('/api/v1/fleet/maintenance/'+ids.maintenance).send({vehicle_id:ids.vehicle,description:'Preventive service',scheduled_date:'2027-01-10',status:'COMPLETED',cost:250,next_service_date:'2027-04-10'})).status).toBe(200);
  await post(fleet,'fleet/fuel',{vehicle_id:ids.vehicle,quantity:20,unit_price:300,odometer:100,recorded_at:'2026-01-10T09:00:00Z'});
  await post(fleet,'fleet/fuel',{vehicle_id:ids.vehicle,quantity:2,unit_price:300,odometer:99,recorded_at:'2026-01-11T09:00:00Z'},409);
  await post(fleet,'fleet/fuel',{vehicle_id:ids.vehicle,quantity:-1,unit_price:300,odometer:101,recorded_at:'2026-01-11T09:00:00Z'},400);
  const report=await fleet.get('/api/v1/fleet/reports');expect(report.status).toBe(200);expect(Number(report.body.data.rows.find((r:{id:string})=>r.id===ids.vehicle).fuel_cost)).toBe(6000);
 });
 const doc=(reference:string,quantity:number)=>({warehouse_id:ids.source,material_id:ids.material,quantity,reference:reference+'-'+suffix,reason:'Integration test'});
 it('receives accepted stock, isolates rejected quantities, and rejects duplicate posting',async()=>{
  ids.material=(await post(wm,'warehouse/materials',{code:'CEM-'+suffix,name:'Portland cement',unit:'bags',category:'Cement',reorder_level:10})).id;
  ids.receipt=(await post(wm,'warehouse/receipts',{...doc('receipt',100),rejected_quantity:5,batch:'LOT-1'})).id;
  await action(wm,'warehouse/receipts/'+ids.receipt+'/post');await action(wm,'warehouse/receipts/'+ids.receipt+'/post',409);
  await post(wm,'warehouse/receipts',doc('receipt',100),409);
  const stock=await wm.get('/api/v1/warehouse/inventory');expect(stock.status).toBe(200);const b=stock.body.data.rows.find((r:{warehouse_id:string})=>r.warehouse_id===ids.source);expect(Number(b.quantity)).toBe(100);expect(Number(b.quarantined)).toBe(5);
 });
 it('issues stock atomically and rejects insufficient stock and unauthorized warehouses',async()=>{
  ids.issue=(await post(wm,'warehouse/issues',{...doc('issue',20),project_id:ids.project,site_id:ids.site})).id;
  await action(wm,'warehouse/issues/'+ids.issue+'/post');await post(wm,'warehouse/issues',{...doc('overissue',200),project_id:ids.project},409);
  await post(limited,'warehouse/receipts',doc('forbidden',1),403);
  expect((await limited.get('/api/v1/warehouse/inventory?warehouse_id='+ids.source)).status).toBe(403);
 });
 it('transfers stock without double-counting and rejects duplicate receipt confirmation',async()=>{
  ids.transfer=(await post(wm,'warehouse/transfers',{...doc('transfer',30),destination_id:ids.dest})).id;
  await action(wm,'warehouse/transfers/'+ids.transfer+'/dispatch');
  let balances=(await pool.query('SELECT warehouse_id,quantity FROM stock_balances WHERE material_id=$1',[ids.material])).rows;
  expect(Number(balances.find(b=>b.warehouse_id===ids.source).quantity)).toBe(50);expect(balances.find(b=>b.warehouse_id===ids.dest)).toBeUndefined();
  await action(limited,'warehouse/transfers/'+ids.transfer+'/receive');await action(limited,'warehouse/transfers/'+ids.transfer+'/receive',409);
  balances=(await pool.query('SELECT warehouse_id,quantity FROM stock_balances WHERE material_id=$1',[ids.material])).rows;expect(balances.reduce((n,b)=>n+Number(b.quantity),0)).toBe(80);
 });
 it('requires a different authorized reviewer for counts and adjustments and detects stale stock',async()=>{
  ids.count=(await post(wm,'warehouse/counts',doc('count',48))).id;
  await action(wm,'warehouse/counts/'+ids.count+'/post',409);await action(reviewer,'warehouse/counts/'+ids.count+'/post');
  ids.adjust=(await post(wm,'warehouse/adjustments',doc('adjust',49))).id;await action(reviewer,'warehouse/adjustments/'+ids.adjust+'/post');
  const stale=(await post(wm,'warehouse/counts',doc('stale',49))).id;
  const ret=(await post(wm,'warehouse/returns',doc('return',1))).id;await action(wm,'warehouse/returns/'+ret+'/post');
  await action(reviewer,'warehouse/counts/'+stale+'/post',409);
 });
 it('keeps damaged returns out of usable stock and exposes immutable traceable movement history',async()=>{
  const ret=(await post(wm,'warehouse/returns',{...doc('damaged',3),condition:'DAMAGED'})).id;await action(wm,'warehouse/returns/'+ret+'/post');
  const b=(await pool.query('SELECT * FROM stock_balances WHERE warehouse_id=$1 AND material_id=$2',[ids.source,ids.material])).rows[0];expect(Number(b.quantity)).toBe(50);expect(Number(b.quarantined)).toBe(8);
  for(const route of ['receipts','issues','transfers','counts','adjustments','returns','reports','movements'])expect((await wm.get('/api/v1/warehouse/'+route)).status).toBe(200);
  await expect(pool.query('UPDATE stock_movements SET reason=$1 WHERE document_id=$2',['tamper',ids.receipt])).rejects.toThrow('append-only');
 });
 it('revokes old cookies after password reset, activation changes and logout',async()=>{
  await post(admin,'admin/users/'+ids.limited+'/password',{password:'Replacement-password!'},200);
  expect((await limited.get('/api/v1/warehouse/inventory')).status).toBe(401);
  expect((await admin.patch('/api/v1/admin/users/'+ids.fleet).send({is_active:false})).status).toBe(200);expect((await fleet.get('/api/v1/fleet/vehicles')).status).toBe(401);
  expect((await wm.post('/api/v1/auth/logout').send({})).status).toBe(200);expect((await wm.get('/api/v1/auth/me')).status).toBe(401);
 });
});
