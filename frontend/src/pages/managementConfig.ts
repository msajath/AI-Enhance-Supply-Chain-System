import {roleCatalog} from '../services/roles';
export interface Field { key:string;label:string;type?:'text'|'number'|'date'|'datetime-local'|'password'|'email'|'checkbox'|'textarea';options?:string[];ref?:string;optional?:boolean;min?:number;hint?:string }
export interface Resource { title:string;description:string;path:string;fields:Field[];columns:string[];edit?:boolean;create?:boolean;actions?:string[] }
const f=(key:string,label:string,extra:Partial<Field>={}):Field=>({key,label,...extra});
const project=f('project_id','Project',{ref:'projects'}),site=f('site_id','Site',{ref:'sites',optional:true});
const status=(options:string[])=>f('status','Status',{options});
const asset=[project,site,f('vehicle_number','Registration / asset number'),f('model','Model'),f('vehicle_type','Type'),f('capacity_tons','Capacity',{type:'number',min:0}),f('capacity_unit','Capacity unit',{options:['tons','kg','m3','units']}),f('ownership','Ownership',{options:['OWNED','LEASED']}),status(['AVAILABLE','MAINTENANCE','INACTIVE'])];
const stock=[f('warehouse_id','Source warehouse',{ref:'warehouses'}),f('material_id','Material',{ref:'materials'}),f('quantity','Quantity',{type:'number',min:0}),f('reference','Unique reference'),f('reason','Reason / supplier details',{type:'textarea'}),f('batch','Batch / lot',{optional:true})];
const document=(title:string,path:string,kind:string,fields:Field[]=stock):Resource=>({title,path:'warehouse/'+path,description:"Create a traceable record, then confirm the operation. Quantities use the selected material's unit.",fields,columns:['reference','material_name','warehouse_name','quantity','status','created_at'],create:true,actions:kind==='TRANSFER'?['dispatch','receive','cancel']:['post','cancel']});
export const resources:Record<string,Resource>={
 'admin/departments':{title:'Departments & cost centres',description:'Maintain departments within your company. Deactivate unused departments to retain history.',path:'admin/departments',fields:[f('code','Department code'),f('name','Department name'),f('cost_center_code','Cost centre code',{optional:true}),f('is_active','Active',{type:'checkbox'})],columns:['code','name','cost_center_code','is_active'],create:true,edit:true},
 'admin/requests':{title:'Access requests',description:'Review pending account requests. Approved accounts still require explicit project and location assignments.',path:'admin/access-requests',fields:[],columns:['full_name','email','requested_role','status','created_at','reviewed_by'],actions:['approve','reject']},
 'admin/users':{title:'Users',description:'Manage accounts, role assignments and authorized projects and locations.',path:'admin/users',fields:[f('full_name','Full name'),f('email','Work email',{type:'email'}),f('role','Role',{options:roleCatalog.map(role=>role.code)}),f('password','Initial password',{type:'password',hint:'At least 12 characters. Share through your approved secure channel.'}),f('is_active','Active',{type:'checkbox'})],columns:['full_name','email','role','is_active'],create:true,edit:true,actions:['access','password']},
 'admin/projects':{title:'Projects',description:'Configure projects and lifecycle status. Use Completed or Cancelled to archive work.',path:'admin/projects',fields:[f('code','Project code'),f('name','Project name'),status(['ACTIVE','PLANNED','ON_HOLD','COMPLETED','CANCELLED']),f('start_date','Start date',{type:'date',optional:true}),f('end_date','End date',{type:'date',optional:true})],columns:['code','name','status','start_date','end_date'],create:true,edit:true},
 'admin/sites':{title:'Sites',description:"Manage construction sites within your organization's projects.",path:'admin/sites',fields:[project,f('code','Site code'),f('name','Site name'),f('address','Address',{type:'textarea',optional:true}),status(['ACTIVE','INACTIVE','CLOSED'])],columns:['code','name','project_id','address','status'],create:true,edit:true},
 'admin/warehouses':{title:'Warehouses',description:'Register locations and assign managers through Users ? Access.',path:'admin/warehouses',fields:[f('code','Warehouse code'),f('name','Name'),f('location','Location'),f('capacity','Storage capacity',{type:'number'}),f('warehouse_type','Warehouse type',{options:['CENTRAL','REGIONAL','SITE']}),site,f('is_active','Active',{type:'checkbox'})],columns:['code','name','location','warehouse_type','is_active'],create:true,edit:true},
 'admin/audit':{title:'Audit logs',description:'Trace administrative changes and stock or fleet transactions. History cannot be edited here.',path:'admin/audit',fields:[],columns:['event_type','actor','module','created_at']},
 'admin/settings':{title:'Organization settings',description:'Manage organization details. Stock reconciliation requires a separate authorized reviewer.',path:'admin/settings',fields:[f('name','Organization name'),f('address','Address',{type:'textarea'})],columns:['code','name','address'],edit:true},
 'fleet/vehicles':{title:'Vehicles',description:'Manage vehicle availability, capacity and project allocation.',path:'fleet/vehicles',fields:asset,columns:['vehicle_number','model','project_id','status','capacity_tons','capacity_unit','currently_assigned'],create:true,edit:true,actions:['history']},
 'fleet/equipment':{title:'Equipment',description:'Forklifts, loaders and other equipment share asset assignment and maintenance controls.',path:'fleet/equipment',fields:asset,columns:['vehicle_number','model','project_id','status','capacity_tons'],create:true,edit:true,actions:['history']},
 'fleet/drivers':{title:'Drivers',description:'Maintain driver eligibility and license expiry. View assignment history under Assignments.',path:'fleet/drivers',fields:[project,f('name','Driver name'),f('phone','Contact number'),f('license_number','License number'),f('license_expiry','License expiry',{type:'date'}),status(['AVAILABLE','UNAVAILABLE','INACTIVE']),f('user_id','Driver login account',{ref:'driverAccounts',optional:true,hint:'Links this driver to their sign-in so they see their own trips.'})],columns:['name','phone','license_number','license_expiry','login_email','status'],create:true,edit:true},
 'fleet/assignments':{title:'Assignments',description:'Allocate eligible assets and drivers. Overlapping bookings and capacity violations are rejected.',path:'fleet/assignments',fields:[project,site,f('vehicle_id','Vehicle / equipment',{ref:'assets'}),f('driver_id','Eligible driver',{ref:'drivers'}),f('starts_at','Start time',{type:'datetime-local'}),f('ends_at','End time',{type:'datetime-local'}),f('load_quantity','Load (asset capacity unit)',{type:'number'})],columns:['vehicle_number','driver_name','project_id','starts_at','ends_at','status'],create:true,actions:['complete','cancel']},
 'fleet/maintenance':{title:'Maintenance',description:'Schedule service and record repair costs. In-progress work restricts new assignments.',path:'fleet/maintenance',fields:[f('vehicle_id','Vehicle / equipment',{ref:'assets'}),f('description','Work description',{type:'textarea'}),f('scheduled_date','Scheduled date',{type:'date'}),status(['SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED']),f('cost','Repair / service cost',{type:'number'}),f('next_service_date','Next service date',{type:'date',optional:true}),f('next_service_mileage','Next service odometer',{type:'number',optional:true})],columns:['vehicle_number','description','scheduled_date','status','cost','next_service_date'],create:true,edit:true},
 'fleet/fuel':{title:'Fuel records',description:'Record fuel in litres. Cost is calculated by PostgreSQL; odometer readings cannot decrease.',path:'fleet/fuel',fields:[f('vehicle_id','Vehicle / equipment',{ref:'assets'}),f('quantity','Fuel quantity (litres)',{type:'number',min:0.001}),f('unit_price','Price per litre',{type:'number'}),f('odometer','Odometer reading',{type:'number'}),f('recorded_at','Recorded at',{type:'datetime-local'})],columns:['vehicle_number','quantity','unit_price','total_cost','odometer','recorded_at'],create:true},
 'fleet/reports':{title:'Fleet reports',description:'Availability, assignment utilization hours, maintenance expenses and fuel expenditure within your scope.',path:'fleet/reports',fields:[],columns:['vehicle_number','status','scheduled_assignments','utilization_hours','maintenance_cost','fuel_litres','fuel_cost']},
 'driver/assignments':{title:'My trips',description:'Every trip your fleet manager has assigned to you. Contact them if something is wrong.',path:'driver/assignments',fields:[],columns:['starts_at','ends_at','vehicle_number','project_name','site_name','load_quantity','status']},
 'warehouse/inventory':{title:'Inventory',description:"Verified available, reserved and quarantined quantities. Reorder alerts use each material's threshold.",path:'warehouse/inventory',fields:[],columns:['code','name','warehouse_name','quantity','reserved','available_quantity','quarantined','unit','low_stock']},
 'warehouse/materials':{title:'Materials',description:'The shared material master. Register a material before recording stock.',path:'warehouse/materials',fields:[f('code','Material code'),f('name','Material name'),f('unit','Unit of measure'),f('category','Category'),f('reorder_level','Reorder threshold',{type:'number'})],columns:['code','name','unit','category','reorder_level'],create:true},
 'warehouse/receipts':document('Goods receiving','receipts','RECEIPT',[...stock.map(f=>f.key==='quantity'?{...f,label:'Accepted quantity'}:f),f('rejected_quantity','Rejected / damaged quantity',{type:'number',min:0})]),
 'warehouse/issues':document('Stock issues','issues','ISSUE',[...stock,project,site]),
 'warehouse/transfers':document('Stock transfers','transfers','TRANSFER',[...stock,f('destination_id','Destination warehouse',{ref:'warehouses'})]),
 'warehouse/counts':document('Stock counts','counts','COUNT',stock.map(f=>f.key==='quantity'?{...f,label:'Counted usable quantity'}:f)),
 'warehouse/adjustments':document('Stock adjustments','adjustments','ADJUSTMENT',stock.map(f=>f.key==='quantity'?{...f,label:'Correct usable quantity'}:f)),
 'warehouse/returns':document('Returns & damage','returns','RETURN',[...stock,f('condition','Returned material condition',{options:['USABLE','QUARANTINED','DAMAGED']})]),
 'warehouse/reports':{title:'Stock reports',description:'Warehouse balances, low-stock alerts and quarantined stock. Open Movement history for transactions and discrepancies.',path:'warehouse/reports',fields:[],columns:['warehouse_name','name','quantity','reserved','available_quantity','quarantined','reorder_level','low_stock']},
 'warehouse/movements':{title:'Movement history',description:'Append-only transaction history. Counts and adjustments record before/after quantities and the actor.',path:'warehouse/movements',fields:[],columns:['material_name','warehouse_name','kind','reference','quantity_change','quarantine_change','before_quantity','after_quantity','actor','created_at']},
};
export const nav:Record<string,{path:string;label:string}[]>={
 admin:[['dashboard','Overview'],['organizations','Companies & Departments'],['users','Users'],['requests','Access requests'],['roles','Roles & Permissions'],['projects','Projects'],['sites','Sites'],['warehouses','Warehouses'],['materials','Materials Catalog'],['suppliers','Suppliers'],['requisitions','Requisitions & Approvals'],['audit','Audit Logs'],['settings','Settings']].map(([p,label])=>({path:'/admin/'+p,label})),
 fleet:[['dashboard','Fleet Overview'],['vehicles','Vehicles'],['drivers','Drivers'],['assignments','Assignments'],['equipment','Equipment'],['maintenance','Maintenance'],['fuel','Fuel Records'],['reports','Fleet Reports']].map(([p,label])=>({path:'/fleet/'+p,label})),
 driver:[['dashboard','My Day'],['assignments','My Trips']].map(([p,label])=>({path:'/driver/'+p,label})),
 warehouse:[['dashboard','Warehouse Overview'],['inventory','Inventory'],['materials','Materials Catalog'],['suppliers','Suppliers'],['requisitions','Requisitions & Approvals'],['receipts','Goods Receiving'],['issues','Stock Issues'],['transfers','Stock Transfers'],['counts','Stock Counts'],['adjustments','Stock Adjustments'],['returns','Returns & Damage'],['reports','Stock Reports'],['movements','Movement History']].map(([p,label])=>({path:'/warehouse/'+p,label})),
};
export function rolePrefix(role:string) { return roleCatalog.find(entry=>entry.label===role)?.prefix ?? 'unassigned'; }

// Reuse existing read views; write controls are excluded for these workspaces.
for(const role of roleCatalog.filter(role=>!['admin','fleet','warehouse','driver'].includes(role.prefix))) {
 nav[role.prefix]=[{path:'/'+role.prefix+'/dashboard',label:'Overview'}];
 const shared= ['management','site','auditor'].includes(role.prefix) ? ['warehouse/inventory','warehouse/movements'] : [];
 if(['management','auditor'].includes(role.prefix))shared.push('fleet/vehicles','fleet/reports');
 for(const source of shared) {
  const key=role.prefix+'/'+source.replaceAll('/','-'), original=resources[source];
  resources[key]={...original,create:false,edit:false,actions:[]};
  nav[role.prefix].push({path:'/'+key,label:original.title});
 }
}

// Reuse the scoped project/site readers without adding any role privileges.
for(const prefix of ['management','procurement','logistics','project','site','auditor']) {
 nav[prefix].push({path:`/${prefix}/projects`,label:'Projects'},{path:`/${prefix}/sites`,label:'Sites'});
}
for(const prefix of ['management','procurement','project']) {
 nav[prefix].push({path:`/${prefix}/requisitions`,label:prefix==='management'?'Assigned approvals':'Requisitions'});
}

resources['auditor/audit']={...resources['admin/audit'],path:'review/audit'};
for(const prefix of ['management','procurement','finance','auditor']) nav[prefix].push({path:`/${prefix}/suppliers`,label:'Suppliers'});
for(const prefix of ['management','procurement','finance','auditor']) nav[prefix].push({path:`/${prefix}/purchasing`,label:prefix==='management'?'Purchase approvals':'Purchasing'});
nav.admin.push({path:'/admin/procurement-policy',label:'Procurement policies'});
nav.supplier.push({path:'/supplier/supplier-portal',label:'RFQs & purchase orders'});
for(const prefix of ['logistics','project','site','fleet','driver']) nav[prefix].push({path:`/${prefix}/deliveries`,label:prefix==='site'?'Site deliveries':'Deliveries'});
for(const prefix of ['admin','management','finance']) nav[prefix].push({path:`/${prefix}/costs`,label:'Project costs'});
for(const prefix of ['management','warehouse','fleet','site','auditor']) nav[prefix].push({path:`/${prefix}/operations`,label:'Operational reports'});
for(const prefix of ['admin','auditor']) nav[prefix].push({path:`/${prefix}/audit-report`,label:'Audit reports'});
resources['procurement/supplier-register']={title:'Supplier registry',description:'Maintain vetted company suppliers. Suspending a supplier blocks new quotations and orders.',path:'procurement/suppliers',fields:[f('code','Supplier code'),f('name','Company name'),f('contact_person','Contact person'),f('email','Email',{type:'email'}),f('phone','Phone'),f('address','Address',{optional:true}),status(['ACTIVE','INACTIVE','SUSPENDED'])],columns:['code','name','contact_person','email','status'],create:true,edit:true};
nav.procurement.push({path:'/procurement/supplier-register',label:'Manage suppliers'});
nav.admin.splice(6,0,{path:'/admin/departments',label:'Departments'});
nav.auditor.push({path:'/auditor/audit',label:'Audit logs'});
export function navigationPermission(path:string):string {
 const [prefix,page]=path.slice(1).split('/');
 if(page==='procurement-policy')return 'procurement.policy.manage';
 if(page==='supplier-register')return 'supplier.manage';
 if(page==='supplier-portal')return 'rfq.supplier.read';
 if(page==='purchasing')return prefix==='management'?'purchase_order.approve':'purchase_order.read';
 if(page==='costs')return 'cost_report.read';
 if(page==='operations')return prefix==='fleet'?'fleet.reports.read':prefix==='site'||prefix==='warehouse'?'inventory.read':'reports.read';
 if(page==='audit-report')return 'audit.read';
 if(page==='deliveries')return prefix==='driver'?'delivery.assigned.read':prefix==='site'?'site_receipt.confirm':prefix==='fleet'?'fleet.assignments.manage':'delivery.read';
 if(page==='assignments'&&prefix==='driver')return 'driver.assignments.read';
 if(['projects','sites'].includes(page)&&prefix!=='admin')return 'projects.read';
 if(page==='materials')return 'inventory.read';
 if(page==='suppliers')return 'supplier.read';
 if(page==='requisitions')return prefix==='management'?'requisition.approve':'requisition.read';
 if(page==='dashboard')return 'dashboard.'+prefix+'.read';
 if(page==='audit')return 'audit.read';
 if(page==='warehouse-inventory'||page==='warehouse-movements')return 'inventory.read';
 if(page==='fleet-vehicles'||page==='fleet-reports')return 'fleet.vehicles.read';
 return prefix==='admin'?'users.read':prefix==='fleet'?'fleet.vehicles.read':'inventory.read';
}
