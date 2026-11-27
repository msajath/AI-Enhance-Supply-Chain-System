import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { pool } from '../src/config/database';
import { PERMISSIONS, type Role } from '../src/auth/permissions';
import { createReportingRouter } from '../src/routes/reporting.routes';
import { budgetSchema, costSchema, periodSchema, toCsv } from '../src/modules/reporting/reporting';

const org='a0000000-0000-0000-0000-000000000001',uid='b0000000-0000-0000-0000-000000000001',project='e0000000-0000-0000-0000-000000000001';
const result=(rows:Record<string,unknown>[]=[])=>( {rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]} );
const query=vi.spyOn(pool,'query'),connect=vi.spyOn(pool,'connect'),tx=vi.fn(),release=vi.fn();
const originalAdmin=PERMISSIONS.ADMIN;
const validCost={project_id:project,cost_type:'PURCHASE',amount:29.99,currency:'LKR',incurred_on:'2026-11-26',reference:'COST-001',evidence_reference:'invoice-evidence-001',description:'Verified synthetic construction cost'};
function app(role:Role|null='FINANCE_OFFICER'){
 const server=express();server.use(express.json());server.use((req,_res,next)=>{if(role)req.auth={userId:uid,organizationId:org,role,email:'test@example.test'};next();});server.use('/reports',createReportingRouter());return server;
}
beforeEach(()=>{
 query.mockReset();tx.mockReset();release.mockReset();
 query.mockResolvedValue(result());
 tx.mockImplementation(async(sql:string)=>result(sql.startsWith('SELECT p.*')?[{id:project,status:'ACTIVE'}]:sql.startsWith('INSERT INTO cost_records')?[{...validCost,id:'cost-1'}]:sql.startsWith('INSERT INTO project_budgets')?[{id:'budget-1'}]:[]));
 connect.mockResolvedValue({query:tx,release} as never);
 // Route-level write tests use explicit capabilities; no role policy changes persist.
 PERMISSIONS.ADMIN=[...originalAdmin,'cost_record.create','cost_budget.manage','cost_report.read','cost_report.export'];
});
afterEach(()=>{PERMISSIONS.ADMIN=originalAdmin;});

describe('report validation and safe CSV',()=>{
 it.each([{from:'2026-02-30',to:'2026-03-01'},{from:'2026-12-01',to:'2026-11-01'},{from:'2020-01-01',to:'2026-12-01'},{from:'2026-11-01',to:'2026-11-30',organization_id:org}])('rejects invalid/unbounded/foreign filter %j',filter=>expect(periodSchema.safeParse(filter).success).toBe(false));
 it('accepts an explicit scoped date range',()=>expect(periodSchema.safeParse({from:'2026-11-01',to:'2026-11-30',project_id:project}).success).toBe(true));
 it.each([NaN,Infinity,-1,0,0.001])('rejects invalid cost amount %s',amount=>expect(costSchema.safeParse({...validCost,amount}).success).toBe(false));
 it('requires evidence and does not trust supplied tenant/actor fields',()=>{
  expect(costSchema.safeParse({...validCost,evidence_reference:''}).success).toBe(false);
  expect(costSchema.safeParse({...validCost,organization_id:org}).success).toBe(false);
  expect(costSchema.safeParse(validCost).success).toBe(true);
 });
 it('rejects reversed budget dates',()=>expect(budgetSchema.safeParse({project_id:project,currency:'LKR',amount:100,period_start:'2026-12-01',period_end:'2026-11-01'}).success).toBe(false));
 it('escapes quotes, newlines and spreadsheet formula prefixes',()=>{
  const csv=toCsv(['reference','description'],[{reference:'=HYPERLINK("unsafe")',description:'line 1\nline 2'},{reference:'  +SUM(1)',description:'plain'}]);
  expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
  expect(csv).toContain('"line 1\nline 2"');expect(csv).toContain('"\'  +SUM(1)"');
 });
});

describe('report authorization and scoped data',()=>{
 it('rejects unauthenticated reports without database access',async()=>{
  expect((await request(app(null)).get('/reports/costs?from=2026-11-01&to=2026-11-30')).status).toBe(401);expect(query).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled();
 });
 it('keeps finance readers and auditors from recording costs/budgets',async()=>{
  for(const role of ['FINANCE_OFFICER','AUDITOR'] as const){
   expect((await request(app(role)).post('/reports/costs').send(validCost)).status).toBe(403);
   expect((await request(app(role)).put('/reports/budgets').send({})).status).toBe(403);
  }
  expect(connect).not.toHaveBeenCalled();
 });
 it('denies generic report readers financial details',async()=>{
  expect((await request(app('AUDITOR')).get('/reports/costs?from=2026-11-01&to=2026-11-30')).status).toBe(403);expect(connect).not.toHaveBeenCalled();
 });
 it('records verified cost with authoritative organization/actor and transactional audit',async()=>{
  const response=await request(app('ADMIN')).post('/reports/costs').send(validCost);expect(response.status).toBe(201);
  const insertCall=tx.mock.calls.find(([sql])=>String(sql).startsWith('INSERT INTO cost_records'))!;
  expect(insertCall[1]).toContain(org);expect(insertCall[1]).toContain(uid);
  expect(tx.mock.calls.some(([sql])=>String(sql).includes('COST_RECORDED'))).toBe(false); // event is a bound value, never interpolated
  expect(tx.mock.calls.some(([sql,params])=>String(sql).includes('system_audit_logs')&&(params as unknown[])[1]==='COST_RECORDED')).toBe(true);
  expect(tx.mock.calls.at(-1)?.[0]).toBe('COMMIT');expect(release).toHaveBeenCalled();
 });
 it('rolls back a failed evidence insert and emits no fake success',async()=>{
  tx.mockImplementation(async(sql:string)=>{if(sql.startsWith('INSERT INTO cost_records'))throw new Error('Private database detail');return result(sql.startsWith('SELECT p.*')?[{id:project,status:'ACTIVE'}]:[]);});
  const response=await request(app('ADMIN')).post('/reports/costs').send(validCost);expect(response.status).toBe(503);expect(JSON.stringify(response.body)).not.toContain('Private database detail');expect(tx.mock.calls.some(([sql])=>sql==='ROLLBACK')).toBe(true);
 });
 it('rejects foreign projects before any financial insert',async()=>{
  tx.mockResolvedValue(result());expect((await request(app('ADMIN')).post('/reports/costs').send(validCost)).status).toBe(403);expect(tx.mock.calls.some(([sql])=>String(sql).startsWith('INSERT INTO cost_records'))).toBe(false);
 });
 it('uses tenant/project/date predicates and consistent read-only snapshot for costs',async()=>{
  const response=await request(app()).get(`/reports/costs?from=2026-11-01&to=2026-11-30&project_id=${project}`);expect(response.status).toBe(200);
  expect(tx.mock.calls.some(([sql])=>sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')).toBe(true);
  for(const [sql,params] of tx.mock.calls.filter(([sql])=>String(sql).includes('FROM cost_records')||String(sql).includes('FROM project_budgets'))){
   expect(sql).toContain('organization_id=$1');expect(sql).toContain('user_project_access');expect(params).toEqual([org,false,uid,'2026-11-01','2026-11-30',project]);
  }
 });
 it('exports actual cost rows with protected CSV cells',async()=>{
  tx.mockImplementation(async(sql:string)=>result(sql.startsWith('SELECT c.id')?[{project_name:'=formula',amount:'12.50',currency:'LKR'}]:[]));
  const response=await request(app()).get('/reports/costs/export?from=2026-11-01&to=2026-11-30');expect(response.status).toBe(200);expect(response.body.data.filename).toBe('qorvenz-costs-2026-11-01-2026-11-30.csv');expect(response.body.data.csv).toContain("'=formula");
 });
 it('serializes and rejects overlapping budget periods',async()=>{
  tx.mockImplementation(async(sql:string)=>result(sql.startsWith('SELECT p.*')?[{id:project,status:'ACTIVE'}]:sql.startsWith('SELECT id FROM project_budgets')?[{id:'existing'}]:[]));
  const response=await request(app('ADMIN')).put('/reports/budgets').send({project_id:project,currency:'LKR',amount:100,period_start:'2026-11-01',period_end:'2026-11-30'});expect(response.status).toBe(409);expect(tx.mock.calls.some(([sql])=>String(sql).includes('FOR UPDATE'))).toBe(true);expect(tx.mock.calls.some(([sql])=>String(sql).startsWith('INSERT INTO project_budgets'))).toBe(false);
 });
 it('does not expose inventory or fleet sources to finance merely for reports.read',async()=>{
  const response=await request(app()).get('/reports/operations?from=2026-11-01&to=2026-11-30');expect(response.status).toBe(200);expect(response.body.data).toMatchObject({fleet:[],inventory:[]});expect(query).not.toHaveBeenCalled();
 });
 it('keeps project-scoped audit reviewers inside explicitly attributed project events',async()=>{
  expect((await request(app('AUDITOR')).get('/reports/audit?from=2026-11-01&to=2026-11-30')).status).toBe(200);
  const [sql,params]=query.mock.calls[0];expect(sql).toContain("l.metadata->>'project_id' IS NOT NULL");expect(sql).toContain('user_project_access');expect(params).toEqual([org,false,uid,'2026-11-01','2026-11-30',null,null,null]);
 });
 it('binds audit event/module filters rather than interpolating user input',async()=>{
  expect((await request(app('AUDITOR')).get('/reports/audit?from=2026-11-01&to=2026-11-30&event_type=COST_RECORDED&module=management')).status).toBe(200);
  const [sql,params]=query.mock.calls[0];expect(sql).toContain('l.event_type=$7');expect(sql).not.toContain('COST_RECORDED');expect(params).toEqual([org,false,uid,'2026-11-01','2026-11-30',null,'COST_RECORDED','management']);
 });
});
