import { Router, type RequestHandler } from 'express';
import { pool, withTransaction } from '../config/database';
import { ApiResponse } from '../utils/apiResponse';
import { hasPermission } from '../auth/permissions';
import { audit, fail, insert, orgParams, permit, project, projectScope, safe, warehouseScope } from '../modules/management/shared';
import { auditPeriodSchema, budgetSchema, costSchema, periodSchema, reportScope, toCsv } from '../modules/reporting/reporting';

const somePermission=(permissions:string[]):RequestHandler=>(req,res,next)=>{
 if(!req.auth){res.status(401).json(ApiResponse.error('Authentication required.','UNAUTHENTICATED'));return;}
 if(!permissions.some(p=>hasPermission(req.auth!.role,p))){res.status(403).json(ApiResponse.error('Report access denied.','FORBIDDEN'));return;}
 next();
};

export function createReportingRouter():Router {
 const r=Router();
 r.use((req,res,next)=>{if(!req.auth){res.status(401).json(ApiResponse.error('Authentication required.','UNAUTHENTICATED'));return;}res.setHeader('Cache-Control','no-store');next();});
 r.get('/projects',somePermission(['reports.read','cost_report.read','fleet.reports.read','inventory.read']),safe(async(req,res)=>{
  const a=req.auth!;
  const rows=(await pool.query(`SELECT p.id,p.code,p.name FROM projects p WHERE p.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$3 AND g.project_id=p.id)) ORDER BY p.name`,orgParams(a))).rows;
  res.json(ApiResponse.success({rows}));
 }));
 r.post('/costs',permit('cost_record.create'),safe(async(req,res)=>{
  const a=req.auth!,data=costSchema.parse(req.body);
  const row=await withTransaction(async c=>{
   await project(c,a,data.project_id,false);
   const saved=await insert(c,'cost_records',{...data,organization_id:a.organizationId,recorded_by:a.userId});
   await audit(c,a,'COST_RECORDED',{id:saved.id,project_id:data.project_id,cost_type:data.cost_type,currency:data.currency,amount:data.amount,reference:data.reference});return saved;
  });res.status(201).json(ApiResponse.success({row}));
 }));
 r.put('/budgets',permit('cost_budget.manage'),safe(async(req,res)=>{
  const a=req.auth!,data=budgetSchema.parse(req.body);
  const row=await withTransaction(async c=>{
   // Serialize budget configuration per project, including overlapping ranges.
   await project(c,a,data.project_id,false);
   await c.query('SELECT id FROM projects WHERE id=$1 AND organization_id=$2 FOR UPDATE',[data.project_id,a.organizationId]);
   const overlap=await c.query(`SELECT id FROM project_budgets WHERE organization_id=$1 AND project_id=$2 AND currency=$3 AND period_start<=$5::date AND period_end>=$4::date AND NOT(period_start=$4::date AND period_end=$5::date)`,[a.organizationId,data.project_id,data.currency,data.period_start,data.period_end]);
   if(overlap.rowCount)fail('Budget periods for the same project and currency must not overlap.');
   const saved=(await c.query(`INSERT INTO project_budgets(organization_id,project_id,currency,amount,period_start,period_end,configured_by) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(organization_id,project_id,currency,period_start,period_end) DO UPDATE SET amount=EXCLUDED.amount,configured_by=EXCLUDED.configured_by,updated_at=now() RETURNING *`,[a.organizationId,data.project_id,data.currency,data.amount,data.period_start,data.period_end,a.userId])).rows[0];
   await audit(c,a,'PROJECT_BUDGET_CONFIGURED',{id:saved.id,project_id:data.project_id,currency:data.currency,amount:data.amount,period_start:data.period_start,period_end:data.period_end});return saved;
  });res.json(ApiResponse.success({row}));
 }));
 const costReport:RequestHandler=safe(async(req,res)=>{
  const a=req.auth!,filter=periodSchema.parse(req.query);
  const data=await withTransaction(async c=>{
   // One consistent snapshot for rows, totals and budgets during the report read.
   await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
   if(filter.project_id)await project(c,a,filter.project_id,false);
   const params=[...orgParams(a),filter.from,filter.to,filter.project_id??null];
   const rows=(await c.query(`SELECT c.id,c.project_id,p.name project_name,c.cost_type,c.amount::text,c.currency,to_char(c.incurred_on,'YYYY-MM-DD') incurred_on,c.reference,c.evidence_reference,c.description
    FROM cost_records c JOIN projects p ON p.id=c.project_id AND p.organization_id=c.organization_id
    WHERE ${reportScope('c')} AND c.incurred_on BETWEEN $4::date AND $5::date AND ($6::uuid IS NULL OR c.project_id=$6) ORDER BY c.incurred_on DESC,c.id`,params)).rows;
   const totals=(await c.query(`SELECT c.currency,sum(c.amount)::text amount FROM cost_records c WHERE ${reportScope('c')}
    AND c.incurred_on BETWEEN $4::date AND $5::date AND ($6::uuid IS NULL OR c.project_id=$6) GROUP BY c.currency ORDER BY c.currency`,params)).rows;
   // Only exactly matching periods are compared; never prorate an arbitrary budget.
   const budgets=(await c.query(`SELECT b.id,b.project_id,p.name project_name,b.currency,b.amount::text budget,
    coalesce((SELECT sum(c.amount) FROM cost_records c WHERE c.project_id=b.project_id AND c.organization_id=b.organization_id AND c.currency=b.currency AND c.incurred_on BETWEEN b.period_start AND b.period_end),0)::text actual,
    (b.amount-coalesce((SELECT sum(c.amount) FROM cost_records c WHERE c.project_id=b.project_id AND c.organization_id=b.organization_id AND c.currency=b.currency AND c.incurred_on BETWEEN b.period_start AND b.period_end),0))::text remaining
    FROM project_budgets b JOIN projects p ON p.id=b.project_id AND p.organization_id=b.organization_id WHERE ${reportScope('b')}
    AND b.period_start=$4::date AND b.period_end=$5::date AND ($6::uuid IS NULL OR b.project_id=$6) ORDER BY p.name,b.currency`,params)).rows;
   return {rows,totals,budgets};
  });
  if(req.path.endsWith('/export')){
   const csv=toCsv(['project_name','cost_type','amount','currency','incurred_on','reference','evidence_reference','description'],data.rows);
   res.json(ApiResponse.success({filename:`qorvenz-costs-${filter.from}-${filter.to}.csv`,csv}));return;
  }
  res.json(ApiResponse.success({...data,from:filter.from,to:filter.to,notice:'Totals include recorded cost evidence only. Different currencies are never combined. Budget comparison requires an exact period match.'}));
 });
 r.get('/costs',permit('cost_report.read'),costReport);
 r.get('/costs/export',permit('cost_report.read'),permit('cost_report.export'),costReport);
 r.get('/operations',somePermission(['reports.read','fleet.reports.read','inventory.read']),safe(async(req,res)=>{
  const a=req.auth!,filter=periodSchema.parse(req.query);
  if(filter.project_id)await withTransaction(c=>project(c,a,filter.project_id!,false));
  const params=[...orgParams(a),filter.from,filter.to,filter.project_id??null];
  // Each section has its own permission and source; generic report permission
  // does not reveal personal driver data or financial expense fields.
  const fleet=hasPermission(a.role,'fleet.reports.read')?(await pool.query(`SELECT v.id,v.vehicle_number,v.asset_kind,v.status,
   count(a.id)::int assignments,coalesce(sum(extract(epoch FROM(least(a.ends_at,(($5::date+1)::timestamp AT TIME ZONE 'Asia/Colombo'))-greatest(a.starts_at,($4::date::timestamp AT TIME ZONE 'Asia/Colombo'))))/3600) FILTER(WHERE a.status<>'CANCELLED'),0)::numeric(14,2)::text utilization_hours
   FROM fleet_vehicles v LEFT JOIN vehicle_assignments a ON a.vehicle_id=v.id AND a.organization_id=v.organization_id AND a.starts_at<(($5::date+1)::timestamp AT TIME ZONE 'Asia/Colombo') AND a.ends_at>($4::date::timestamp AT TIME ZONE 'Asia/Colombo')
   WHERE ${projectScope('v')} AND ($6::uuid IS NULL OR v.project_id=$6) GROUP BY v.id ORDER BY v.vehicle_number`,params)).rows:[];
  const inventory=hasPermission(a.role,'inventory.read')?(await pool.query(`SELECT m.id,i.code,i.name,w.name warehouse_name,d.kind,d.reference,m.quantity_change::text,m.quarantine_change::text,m.created_at
   FROM stock_movements m JOIN stock_documents d ON d.id=m.document_id JOIN materials i ON i.id=m.material_id JOIN warehouses w ON w.id=m.warehouse_id
   WHERE ${warehouseScope('m')} AND m.created_at >= ($4::date::timestamp AT TIME ZONE 'Asia/Colombo') AND m.created_at <(($5::date+1)::timestamp AT TIME ZONE 'Asia/Colombo') AND ($6::uuid IS NULL OR d.project_id=$6)
   ORDER BY m.created_at DESC,m.id`,params)).rows:[];
  res.json(ApiResponse.success({fleet,inventory,from:filter.from,to:filter.to,notice:'Business dates use Asia/Colombo. Inventory is a dated movement ledger, not a reconstructed historical stock balance.'}));
 }));
 r.get('/audit',permit('audit.read'),safe(async(req,res)=>{
  const a=req.auth!,filter=auditPeriodSchema.parse(req.query);
  if(filter.project_id)await withTransaction(c=>project(c,a,filter.project_id!,false));
  const rows=(await pool.query(`SELECT l.id,l.event_type,l.module,l.created_at,u.full_name actor,l.metadata
   FROM system_audit_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE (l.metadata->>'organization_id'=$1::text OR (l.metadata->>'organization_id' IS NULL AND u.organization_id=$1::uuid))
   AND l.created_at >= ($4::date::timestamp AT TIME ZONE 'Asia/Colombo') AND l.created_at <(($5::date+1)::timestamp AT TIME ZONE 'Asia/Colombo')
   AND ($6::uuid IS NULL OR l.metadata->>'project_id'=$6::text)
   AND ($7::text IS NULL OR l.event_type=$7) AND ($8::text IS NULL OR l.module=$8)
   AND ($2::boolean OR (l.metadata->>'project_id' IS NOT NULL AND EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$3 AND g.project_id::text=l.metadata->>'project_id')))
   ORDER BY l.created_at DESC,l.id`,[...orgParams(a),filter.from,filter.to,filter.project_id??null,filter.event_type??null,filter.module??null])).rows;
  res.json(ApiResponse.success({rows,notice:'Project-scoped reviewers see only events with explicit authorized project attribution. Organization-only events remain visible to company administrators.'}));
 }));
 return r;
}
