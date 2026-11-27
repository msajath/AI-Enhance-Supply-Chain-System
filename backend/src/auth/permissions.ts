/** Explicit server-side policy; Admin configures the system without posting stock or fleet transactions. */
export const ROLES = ['ADMIN', 'FLEET_MANAGER', 'WAREHOUSE_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'PROCUREMENT_OFFICER', 'LOGISTICS_COORDINATOR', 'PROJECT_MANAGER', 'SITE_STOREKEEPER', 'FINANCE_OFFICER', 'DRIVER_OPERATOR', 'SUPPLIER_USER', 'AUDITOR', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role,string> = { ADMIN:'Admin', FLEET_MANAGER:'Fleet manager', WAREHOUSE_MANAGER:'Warehouse manager', SUPPLY_CHAIN_MANAGER:'Supply chain manager', PROCUREMENT_OFFICER:'Procurement officer', LOGISTICS_COORDINATOR:'Logistics coordinator', PROJECT_MANAGER:'Project manager', SITE_STOREKEEPER:'Site storekeeper', FINANCE_OFFICER:'Finance officer', DRIVER_OPERATOR:'Driver / operator', SUPPLIER_USER:'Supplier', AUDITOR:'Auditor', DRIVER:'Driver' };
export const DASHBOARD_PREFIX: Record<Role,string> = { ADMIN:'admin', FLEET_MANAGER:'fleet', WAREHOUSE_MANAGER:'warehouse', SUPPLY_CHAIN_MANAGER:'management', PROCUREMENT_OFFICER:'procurement', LOGISTICS_COORDINATOR:'logistics', PROJECT_MANAGER:'project', SITE_STOREKEEPER:'site', FINANCE_OFFICER:'finance', DRIVER_OPERATOR:'driver', SUPPLIER_USER:'supplier', AUDITOR:'auditor', DRIVER:'driver' };
export const PERMISSIONS: Record<Role, readonly string[]> = {
 ADMIN: ['users.read','users.create','users.update','users.deactivate','projects.read','projects.manage','sites.manage','warehouses.read','warehouses.manage','audit.read','settings.manage','catalog.read','catalog.manage','approval.configure'],
 FLEET_MANAGER: ['projects.read','fleet.vehicles.read','fleet.vehicles.manage','fleet.drivers.manage','fleet.assignments.manage','fleet.maintenance.manage','fleet.fuel.manage','fleet.reports.read'],
 WAREHOUSE_MANAGER: ['catalog.read','scorecard.record','scorecard.read','projects.read','warehouses.read','inventory.read','inventory.receive','inventory.issue','inventory.transfer','inventory.adjust','inventory.count','inventory.return'],
 SUPPLY_CHAIN_MANAGER: ['catalog.read','scorecard.read','requisition.read','projects.read','inventory.read','fleet.vehicles.read','fleet.reports.read','reports.read','requisition.approve','purchase_order.approve'],
 PROCUREMENT_OFFICER: ['catalog.manage','catalog.read','scorecard.read','projects.read','requisition.read','requisition.create','requisition.update','requisition.submit','rfq.create','quotation.read','quotation.evaluate','purchase_order.create'],
 LOGISTICS_COORDINATOR: ['projects.read','transport_request.read','transport_request.create','delivery.read','delivery.assign','delivery.update'],
 PROJECT_MANAGER: ['catalog.read','projects.read','requisition.read','requisition.create','requisition.submit','delivery.read'],
 SITE_STOREKEEPER: ['catalog.read','requisition.read','requisition.create','requisition.submit','projects.read','inventory.read','stock_movement.read','site_receipt.confirm'],
 FINANCE_OFFICER: ['finance.read','cost_report.read','cost_report.export','reports.read','reports.export'],
 DRIVER: ['driver.assignments.read'],
 DRIVER_OPERATOR: ['driver.assignments.read','delivery.assigned.read','delivery.assigned.update','proof_of_delivery.submit'],
 SUPPLIER_USER: ['rfq.supplier.read','quotation.supplier.submit','purchase_order.supplier.read'],
 AUDITOR: ['projects.read','inventory.read','fleet.vehicles.read','fleet.reports.read','reports.read','audit.read'],
};
// Capabilities for the delivered domain workflows. Assignment never bypasses project/tenant checks.
const DOMAIN_PERMISSIONS: Partial<Record<Role,readonly string[]>> = {
 ADMIN:['supplier.read','procurement.pricing.read','procurement.policy.manage','reports.read','cost_report.read','cost_report.export','cost_record.create','cost_budget.manage'],
 SUPPLY_CHAIN_MANAGER:['supplier.read','procurement.pricing.read','requisition.read','quotation.read','purchase_order.read','cost_report.read'],
 PROCUREMENT_OFFICER:['supplier.read','supplier.manage','procurement.pricing.read','purchase_order.read'],
 FINANCE_OFFICER:['supplier.read','procurement.pricing.read','purchase_order.read'],
 AUDITOR:['supplier.read','procurement.pricing.read','requisition.read','quotation.read','purchase_order.read'],
};
for(const role of ROLES) PERMISSIONS[role]=[...new Set([...PERMISSIONS[role],...(DOMAIN_PERMISSIONS[role]??[])])];
export function isRole(value: unknown): value is Role { return typeof value==='string' && (ROLES as readonly string[]).includes(value); }
export const PROJECT_READ_ROLES: readonly Role[] = ROLES.filter(role => PERMISSIONS[role].includes('projects.read') && role !== 'FLEET_MANAGER');
export const COMPANY_WIDE_ROLES: readonly Role[] = ['ADMIN'];
export function hasCompanyWideScope(role: Role): boolean { return COMPANY_WIDE_ROLES.includes(role); }
// Dashboard access is explicit policy, separate from any business write permission.
for (const role of ROLES) PERMISSIONS[role] = [...PERMISSIONS[role], 'dashboard.' + DASHBOARD_PREFIX[role] + '.read'];
/** Unknown permissions are denied; existing dot-separated identifiers stay compatible. */
export function hasPermission(role: Role, permission: string): boolean { return PERMISSIONS[role]?.includes(permission) ?? false; }
