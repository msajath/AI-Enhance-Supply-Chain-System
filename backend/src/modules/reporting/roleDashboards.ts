import { pool } from '../../config/database';
import type { AuthContext } from '../../middleware/authenticate';

/** Role metrics use the same explicit grants as their workspaces, never demo constants. */
export async function roleDashboard(a:AuthContext) {
 const availability=(await pool.query("SELECT to_regclass('public.system_audit_logs') core,to_regclass('public.approval_requests') procurement,to_regclass('public.deliveries') delivery,to_regclass('public.cost_records') costs")).rows[0];
 const needsProcurement=['SUPPLY_CHAIN_MANAGER','PROCUREMENT_OFFICER','PROJECT_MANAGER','SUPPLIER_USER'].includes(a.role);
 const needsDelivery=['LOGISTICS_COORDINATOR','PROJECT_MANAGER','SITE_STOREKEEPER'].includes(a.role);
 if(!availability?.core||needsProcurement&&!availability?.procurement||needsDelivery&&!availability?.delivery||a.role==='FINANCE_OFFICER'&&!availability?.costs)
  return {cards:[],activity:[],alerts:[],modulesPending:true};
 const args=[a.organizationId,a.userId];
 const projectScope=(alias:string)=>`${alias}.organization_id=$1 AND EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$2 AND g.project_id=${alias}.project_id)`;
 const warehouseScope=(alias:string)=>`${alias}.organization_id=$1 AND EXISTS(SELECT 1 FROM user_warehouse_access g WHERE g.user_id=$2 AND g.warehouse_id=${alias}.warehouse_id)`;
 const siteScope=(alias:string)=>`${projectScope(alias)} AND EXISTS(SELECT 1 FROM user_site_access s WHERE s.user_id=$2 AND s.site_id=${alias}.destination_site_id)`;
 let labels:Record<string,string>={},sql='';
 if(a.role==='SUPPLY_CHAIN_MANAGER'){
  labels={approvals:'Assigned requisition approvals',orders:'Approved purchase orders',requisitions:'Project requisitions'};
  sql=`SELECT (SELECT count(*) FROM approval_requests q JOIN requisitions r ON r.id=q.requisition_id WHERE ${projectScope('r')} AND q.approver_id=$2 AND q.status='PENDING') approvals,
   (SELECT count(*) FROM procurement_purchase_orders o WHERE ${projectScope('o')} AND o.status='OPEN') orders,
   (SELECT count(*) FROM requisitions r WHERE ${projectScope('r')}) requisitions`;
 }else if(a.role==='PROCUREMENT_OFFICER'){
  labels={requisitions:'Approved requisitions',rfqs:'Quotation requests',orders:'Purchase orders',suppliers:'Active company suppliers'};
  sql=`SELECT (SELECT count(*) FROM requisitions r WHERE ${projectScope('r')} AND r.status='APPROVED') requisitions,
   (SELECT count(*) FROM procurement_rfqs f JOIN requisitions r ON r.id=f.requisition_id WHERE ${projectScope('r')}) rfqs,
   (SELECT count(*) FROM procurement_purchase_orders o WHERE ${projectScope('o')}) orders,
   (SELECT count(*) FROM suppliers WHERE organization_id=$1 AND status='ACTIVE') suppliers`;
 }else if(a.role==='LOGISTICS_COORDINATOR'){
  labels={requests:'Transport requests',unplanned:'Requests awaiting planning',active:'Active deliveries'};
  sql=`SELECT (SELECT count(*) FROM transport_requests r WHERE ${siteScope('r')}) requests,
   (SELECT count(*) FROM transport_requests r WHERE ${siteScope('r')} AND r.status='REQUESTED') unplanned,
   (SELECT count(*) FROM deliveries d JOIN transport_requests r ON r.id=d.transport_request_id WHERE ${siteScope('r')} AND d.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')) active`;
 }else if(a.role==='PROJECT_MANAGER'){
  labels={projects:'Assigned projects',requisitions:'Project requisitions',deliveries:'Project deliveries'};
  sql=`SELECT (SELECT count(*) FROM projects p WHERE p.organization_id=$1 AND EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$2 AND g.project_id=p.id)) projects,
   (SELECT count(*) FROM requisitions r WHERE ${projectScope('r')}) requisitions,
   (SELECT count(*) FROM deliveries d JOIN transport_requests r ON r.id=d.transport_request_id WHERE ${siteScope('r')}) deliveries`;
 }else if(a.role==='SITE_STOREKEEPER'){
  labels={stock:'Authorized stock lines',arrivals:'Deliveries awaiting receipt',receipts:'Site receipts'};
  sql=`SELECT (SELECT count(*) FROM stock_balances b WHERE ${warehouseScope('b')}) stock,
   (SELECT count(*) FROM deliveries d JOIN transport_requests r ON r.id=d.transport_request_id WHERE ${siteScope('r')} AND d.status='ARRIVED') arrivals,
   (SELECT count(*) FROM site_receipts s JOIN deliveries d ON d.id=s.delivery_id JOIN transport_requests r ON r.id=d.transport_request_id WHERE ${siteScope('r')}) receipts`;
 }else if(a.role==='FINANCE_OFFICER'){
  labels={records:'Evidence-backed cost records',currencies:'Currencies in recorded costs',budgets:'Configured project budgets'};
  sql=`SELECT (SELECT count(*) FROM cost_records c WHERE ${projectScope('c')}) records,
   (SELECT count(DISTINCT c.currency) FROM cost_records c WHERE ${projectScope('c')}) currencies,
   (SELECT count(*) FROM project_budgets b WHERE ${projectScope('b')}) budgets`;
 }else if(a.role==='SUPPLIER_USER'){
  labels={linked:'Active supplier links',rfqs:'Invited quotation requests',quotations:'Submitted quotations',orders:'Approved purchase orders'};
  const supplier="SELECT s.id FROM supplier_users u JOIN suppliers s ON s.id=u.supplier_id AND s.organization_id=u.organization_id WHERE u.user_id=$2 AND u.organization_id=$1 AND s.status='ACTIVE'";
  sql=`SELECT (SELECT count(*) FROM suppliers WHERE id IN (${supplier})) linked,
   (SELECT count(*) FROM procurement_rfq_suppliers WHERE supplier_id IN (${supplier}) AND organization_id=$1) rfqs,
   (SELECT count(*) FROM procurement_quotations WHERE supplier_id IN (${supplier}) AND organization_id=$1) quotations,
   (SELECT count(*) FROM procurement_purchase_orders WHERE supplier_id IN (${supplier}) AND organization_id=$1 AND status='OPEN') orders`;
 }else if(a.role==='AUDITOR'){
  labels={stock:'Authorized stock movements',assets:'Authorized fleet assets',events:'Accessible project audit events'};
  sql=`SELECT (SELECT count(*) FROM stock_movements m WHERE ${warehouseScope('m')}) stock,
   (SELECT count(*) FROM fleet_vehicles v WHERE ${projectScope('v')}) assets,
   (SELECT count(*) FROM system_audit_logs l WHERE l.metadata->>'organization_id'=$1::text AND EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$2 AND g.project_id::text=l.metadata->>'project_id')) events`;
 }
 if(!sql)return {cards:[],activity:[],alerts:[],modulesPending:true};
 const stats=(await pool.query(sql,args)).rows[0];
 const alerts=a.role==='SUPPLIER_USER'&&Number(stats.linked)===0?[{id:'supplier-link',notice:'Ask your administrator to link your account to an active supplier before responding to quotations.'}]:[];
 return {cards:Object.entries(labels).map(([key,label])=>({label,value:Number(stats[key])})),activity:[],alerts,modulesPending:false};
}
