import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { pool, withTransaction } from '../src/config/database';
import { createProcurementRouter } from '../src/routes/procurement.routes';
import { requisitionSchema, quotationSchema, calendarDate } from '../src/modules/procurement/shared';
import type { Role } from '../src/auth/permissions';
vi.mock('../src/config/database',()=>({pool:{query:vi.fn()},withTransaction:vi.fn()}));
const query=vi.mocked(pool.query),transaction=vi.mocked(withTransaction);
const org='a0000000-0000-4000-8000-000000000001',user='b0000000-0000-4000-8000-000000000001',projectId='c0000000-0000-4000-8000-000000000001',material='d0000000-0000-4000-8000-000000000001',id='e0000000-0000-4000-8000-000000000001';
const result=(rows:unknown[])=>({rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]});
function app(role:Role='PROCUREMENT_OFFICER',authenticated=true){const a=express();a.use(express.json());a.use((req,_res,next)=>{if(authenticated)req.auth={userId:user,organizationId:org,email:'test@example.test',role};next();});a.use('/procurement',createProcurementRouter());return a;}
beforeEach(()=>{vi.resetAllMocks();transaction.mockImplementation(async cb=>cb({query} as never));});
describe('procurement validation and security without a live database',()=>{
 it('rejects nonexistent calendar dates and duplicate/zero material lines',()=>{
  expect(calendarDate.safeParse('2028-02-29').success).toBe(true);expect(calendarDate.safeParse('2027-02-29').success).toBe(false);
  const v={project_id:projectId,required_by_date:'2028-01-01',items:[{material_id:material,quantity:1}]};expect(requisitionSchema.safeParse(v).success).toBe(true);
  expect(requisitionSchema.safeParse({...v,items:[...v.items,...v.items]}).success).toBe(false);
  expect(requisitionSchema.safeParse({...v,items:[{material_id:material,quantity:0}]}).success).toBe(false);
 });
 it('rejects duplicate quotation lines and arbitrary supplier identity',()=>{
  const line={requisition_item_id:id,quantity:1,unit_price:2};const v={rfq_id:id,valid_until:'2028-01-01',lead_time_days:2,items:[line]};expect(quotationSchema.safeParse(v).success).toBe(true);expect(quotationSchema.safeParse({...v,supplier_id:id}).success).toBe(false);expect(quotationSchema.safeParse({...v,items:[line,line]}).success).toBe(false);
 });
 it('requires authentication before touching persistence',async()=>{expect((await request(app('PROCUREMENT_OFFICER',false)).get('/procurement/requisitions')).status).toBe(401);expect(query).not.toHaveBeenCalled();});
 it('never creates an empty requisition',async()=>{const r=await request(app()).post('/procurement/requisitions').send({project_id:projectId,required_by_date:'2028-01-01',items:[]});expect(r.status).toBe(400);expect(transaction).not.toHaveBeenCalled();});
 it('parameterizes organization, caller and project-grant filtering',async()=>{query.mockResolvedValueOnce(result([]));expect((await request(app()).get('/procurement/requisitions')).status).toBe(200);expect(query.mock.calls[0][0]).toContain('user_project_access');expect(query.mock.calls[0][1]).toEqual([org,false,user]);});
 it('requires rejection comments before starting a transaction',async()=>{expect((await request(app('SUPPLY_CHAIN_MANAGER')).post('/procurement/approvals/'+id+'/reject').send({comments:'  '})).status).toBe(400);expect(transaction).not.toHaveBeenCalled();});
 it('locks the approval/document and prevents another reviewer deciding',async()=>{
  query.mockResolvedValueOnce(result([{id,project_id:projectId,status:'PENDING',document_status:'PENDING_APPROVAL',approver_id:'other',requester_id:'requester'}])).mockResolvedValueOnce(result([{id:projectId,status:'ACTIVE'}]));
  const r=await request(app('SUPPLY_CHAIN_MANAGER')).post('/procurement/approvals/'+id+'/approve').send({});expect(r.status).toBe(403);expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF ar,r');expect(query.mock.calls.some(c=>String(c[0]).startsWith('UPDATE'))).toBe(false);
 });
 it('rejects already decided approval without updating',async()=>{
  query.mockResolvedValueOnce(result([{id,project_id:projectId,status:'APPROVED',document_status:'APPROVED',approver_id:user,requester_id:'other'}])).mockResolvedValueOnce(result([{id:projectId,status:'ACTIVE'}]));
  expect((await request(app('SUPPLY_CHAIN_MANAGER')).post('/procurement/approvals/'+id+'/approve').send({})).status).toBe(409);expect(query.mock.calls.some(c=>String(c[0]).startsWith('UPDATE'))).toBe(false);
 });
 it('supplier portal requires explicit account mapping, never an email match',async()=>{
  query.mockResolvedValueOnce(result([]));expect((await request(app('SUPPLIER_USER')).get('/procurement/supplier/rfqs')).status).toBe(403);expect(query.mock.calls[0][0]).toContain('supplier_users');expect(query.mock.calls[0][1]).toEqual([user,org]);
 });
 it('commits decision and audit through one transaction callback',async()=>{
  query.mockResolvedValueOnce(result([{id,project_id:projectId,status:'PENDING',document_status:'PENDING_APPROVAL',approver_id:user,requester_id:'other',requisition_id:id}])).mockResolvedValueOnce(result([{id:projectId,status:'ACTIVE'}])).mockResolvedValue(result([{id}]));
  expect((await request(app('SUPPLY_CHAIN_MANAGER')).post('/procurement/approvals/'+id+'/approve').send({comments:'Reviewed'})).status).toBe(200);expect(transaction).toHaveBeenCalledTimes(1);expect(query.mock.calls.some(c=>String(c[0]).startsWith('INSERT INTO approval_actions'))).toBe(true);expect(query.mock.calls.some(c=>String(c[0]).startsWith('INSERT INTO system_audit_logs'))).toBe(true);
 });
 it('serializes purchase order allocation on the requisition and refuses over-ordering',async()=>{
  query.mockResolvedValueOnce(result([{id,project_id:projectId,requisition_id:id,valid:true,supplier_status:'ACTIVE',requisition_status:'APPROVED'}]))
   .mockResolvedValueOnce(result([{id:projectId,status:'ACTIVE'}]))
   .mockResolvedValueOnce(result([{id,approver_id:'reviewer',role:'SUPPLY_CHAIN_MANAGER',is_active:true}]))
   .mockResolvedValueOnce(result([{id:projectId,status:'ACTIVE'}]))
   .mockResolvedValueOnce(result([{requisition_item_id:material,quantity:'5',unit_price:'2.00'}]))
   .mockResolvedValueOnce(result([{remaining:'4'}]));
  const r=await request(app()).post('/procurement/purchase-orders').send({quotation_id:id,reference_no:'PO-TEST'});expect(r.status).toBe(409);expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF r');expect(query.mock.calls.some(c=>String(c[0]).startsWith('INSERT INTO procurement_purchase_orders'))).toBe(false);
 });
 it('creates an assigned approval only after validating company materials',async()=>{
  query.mockResolvedValueOnce(result([{id:projectId,status:'ACTIVE'}])).mockResolvedValueOnce(result([{valid:true}]))
   .mockResolvedValueOnce(result([{id,approver_id:'reviewer',role:'SUPPLY_CHAIN_MANAGER',is_active:true}]))
   .mockResolvedValueOnce(result([{id:projectId,status:'ACTIVE'}])).mockResolvedValueOnce(result([]));
  const r=await request(app()).post('/procurement/requisitions').send({project_id:projectId,required_by_date:'2028-01-01',items:[{material_id:material,quantity:1}]});expect(r.status).toBe(403);expect(query.mock.calls[4][1]).toEqual([org,[material]]);expect(query.mock.calls.some(c=>String(c[0]).startsWith('INSERT'))).toBe(false);
 });});
