import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { pool } from '../src/config/database';
import { createDeliveryRouter } from '../src/routes/delivery.routes';
import { canTransition, deliverySchema, proofSchema, receiptSchema, reconciles, transportSchema } from '../src/modules/delivery/rules';
import type { Role } from '../src/auth/permissions';

const org='a0000000-0000-0000-0000-000000000001',user='b0000000-0000-0000-0000-000000000001';
const id='d0000000-0000-0000-0000-000000000001',project='e0000000-0000-0000-0000-000000000001',site='f0000000-0000-0000-0000-000000000001';
const item='c0000000-0000-0000-0000-000000000001';
const result=(rows:unknown[]=[])=>({rows,rowCount:rows.length,command:'SELECT',fields:[],oid:0});
const query=vi.spyOn(pool,'query'),tx=vi.fn(),release=vi.fn();
const delivery={id,organization_id:org,project_id:project,destination_site_id:site,transport_request_id:id,assignment_id:id,driver_user_id:user,status:'ARRIVED',dispatch_at:'2026-01-01T00:00:00Z'};
function app(role?:Role){const a=express();a.use(express.json());a.use((req,_res,next)=>{if(role)req.auth={userId:user,organizationId:org,email:'test@example.test',role};next();});a.use('/delivery',createDeliveryRouter());return a;}
beforeEach(()=>{
 query.mockReset();query.mockResolvedValue(result());tx.mockReset();release.mockReset();
 vi.spyOn(pool,'connect').mockResolvedValue({query:tx,release} as never);
 tx.mockImplementation(async(sql:string)=>{
  if(sql.startsWith('SELECT d.*,r.project_id'))return result([delivery]);
  if(sql.startsWith('SELECT p.*'))return result([{id:project,status:'ACTIVE'}]);
  if(sql.startsWith('SELECT s.*'))return result([{id:site,project_id:project,status:'ACTIVE'}]);
  if(sql.startsWith('SELECT id FROM proofs_of_delivery'))return result([{id:'proof'}]);
  if(sql.startsWith('SELECT id,quantity FROM delivery_items'))return result([{id:item,quantity:'10.000'}]);
  if(sql.startsWith('SELECT i.quantity'))return result([{quantity:'10.000',accepted:'10.000'}]);
  if(sql.startsWith('INSERT'))return result([{id:'saved'}]);
  return result();
 });
});
describe('delivery validation and deterministic state rules',()=>{
 it.each([['PLANNED','DISPATCHED',false,true],['PLANNED','DISPATCHED',true,false],['DISPATCHED','IN_TRANSIT',true,true],['IN_TRANSIT','ARRIVED',true,true],['ARRIVED','COMPLETED',true,false],['FAILED','IN_TRANSIT',false,false],['COMPLETED','CANCELLED',false,false]])('transition %s → %s (driver %s)',(from,to,driver,expected)=>expect(canTransition(String(from),String(to),Boolean(driver))).toBe(expected));
 it('reconciles decimals without binary rounding errors',()=>{expect(reconciles(0.3,0.1,0.2,0)).toBe(true);expect(reconciles(10,8,1,0)).toBe(false);});
 it('rejects duplicate, empty and nonpositive request material lines',()=>{
  const base={project_id:project,warehouse_id:id,destination_site_id:site,needed_at:'2027-01-01T00:00:00Z'};
  for(const items of [[],[{material_id:item,quantity:0}],[{material_id:item,quantity:-1}],[{material_id:item,quantity:1},{material_id:item,quantity:2}]])expect(transportSchema.safeParse({...base,items}).success).toBe(false);
 });
 it('does not accept file URLs as evidence metadata',()=>expect(proofSchema.safeParse({receiver_name:'Receiver',received_at:'2026-01-01T00:00:00Z',file_url:'https://example.com/untrusted'}).success).toBe(false));
 it('rejects duplicate receipt item IDs',()=>expect(receiptSchema.safeParse({items:[{delivery_item_id:item,accepted_quantity:1,rejected_quantity:0,short_quantity:0},{delivery_item_id:item,accepted_quantity:1,rejected_quantity:0,short_quantity:0}]}).success).toBe(false));
 it('requires a scheduled assignment reference and material lines when planning',()=>expect(deliverySchema.safeParse({transport_request_id:id,eta:'2027-01-01T00:00:00Z',items:[]}).success).toBe(false));
});
describe('delivery route authorization and transaction safety',()=>{
 it('rejects unauthenticated access without SQL',async()=>{expect((await request(app()).get('/delivery/deliveries')).status).toBe(401);expect(query).not.toHaveBeenCalled();});
 it('denies supplier transport planning',async()=>expect((await request(app('SUPPLIER_USER')).post('/delivery/deliveries').send({})).status).toBe(403));
 it('denies legacy driver delivery writes',async()=>{expect((await request(app('DRIVER')).post(`/delivery/deliveries/${id}/status`).send({status:'IN_TRANSIT'})).status).toBe(403);expect(tx).not.toHaveBeenCalled();});
 it('lists driver deliveries using authenticated user and company, not query overrides',async()=>{
  expect((await request(app('DRIVER_OPERATOR')).get('/delivery/deliveries?user_id=someone-else')).status).toBe(200);
  const [sql,params]=query.mock.calls[0];expect(sql).toContain('fd.user_id=$3');expect(params).toEqual([org,false,user]);
 });
 it('rejects another driver delivery detail',async()=>{
  tx.mockResolvedValue(result([{...delivery,driver_user_id:'another-user'}]));
  expect((await request(app('DRIVER_OPERATOR')).get(`/delivery/deliveries/${id}`)).status).toBe(403);
 });
 it('rolls back site receipt with an unreconciled quantity before inserting evidence',async()=>{
  const r=await request(app('SITE_STOREKEEPER')).post(`/delivery/deliveries/${id}/receipt`).send({items:[{delivery_item_id:item,accepted_quantity:8,rejected_quantity:1,short_quantity:0,reason:'Damaged'}]});
  expect(r.status).toBe(400);expect(tx.mock.calls.some(([sql])=>String(sql).startsWith('INSERT'))).toBe(false);expect(tx.mock.calls.some(([sql])=>sql==='ROLLBACK')).toBe(true);
 });
 it('requires a discrepancy reason',async()=>{
  expect((await request(app('SITE_STOREKEEPER')).post(`/delivery/deliveries/${id}/receipt`).send({items:[{delivery_item_id:item,accepted_quantity:8,rejected_quantity:1,short_quantity:1}]})).status).toBe(400);
  expect(tx.mock.calls.some(([sql])=>String(sql).startsWith('INSERT'))).toBe(false);
 });
 it('records a complete reconciled receipt and assignment closure in one transaction',async()=>{
  const r=await request(app('SITE_STOREKEEPER')).post(`/delivery/deliveries/${id}/receipt`).send({items:[{delivery_item_id:item,accepted_quantity:10,rejected_quantity:0,short_quantity:0}]});
  expect(r.status).toBe(201);expect(tx.mock.calls.some(([sql])=>String(sql).startsWith('INSERT INTO site_receipts'))).toBe(true);
  expect(tx.mock.calls.some(([sql])=>String(sql).includes("UPDATE vehicle_assignments SET status='COMPLETED'"))).toBe(true);
  expect(tx.mock.calls.some(([sql])=>sql==='COMMIT')).toBe(true);expect(release).toHaveBeenCalled();
 });
 it('rejects metadata proof for a not-yet-arrived delivery',async()=>{
  tx.mockImplementation(async(sql:string)=>result(sql.startsWith('SELECT d.')?[{...delivery,status:'IN_TRANSIT'}]:[]));
  expect((await request(app('DRIVER_OPERATOR')).post(`/delivery/deliveries/${id}/proof`).send({receiver_name:'Receiver',received_at:'2026-01-02T00:00:00Z'})).status).toBe(409);
  expect(tx.mock.calls.some(([sql])=>String(sql).startsWith('INSERT'))).toBe(false);
 });
});
