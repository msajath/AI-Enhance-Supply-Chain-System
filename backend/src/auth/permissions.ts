/** Explicit server-side policy; Admin configures the system without posting stock or fleet transactions. */
export const ROLES = ['ADMIN', 'FLEET_MANAGER', 'WAREHOUSE_MANAGER', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role,string> = { ADMIN:'Admin', FLEET_MANAGER:'Fleet manager', WAREHOUSE_MANAGER:'Warehouse manager', DRIVER:'Driver' };
export const PERMISSIONS: Record<Role, readonly string[]> = {
 ADMIN: ['users.read','users.create','users.update','users.deactivate','projects.read','projects.manage','sites.manage','warehouses.read','warehouses.manage','audit.read','settings.manage'],
 FLEET_MANAGER: ['projects.read','fleet.vehicles.read','fleet.vehicles.manage','fleet.drivers.manage','fleet.assignments.manage','fleet.maintenance.manage','fleet.fuel.manage','fleet.reports.read'],
 WAREHOUSE_MANAGER: ['projects.read','warehouses.read','inventory.read','inventory.receive','inventory.issue','inventory.transfer','inventory.adjust','inventory.count','inventory.return'],
 // Drivers only see the assignments on the fleet driver record linked to their own login.
 DRIVER: ['driver.assignments.read'],
};
export function isRole(value: unknown): value is Role { return typeof value==='string' && (ROLES as readonly string[]).includes(value); }
export const PROJECT_READ_ROLES: readonly Role[] = ['ADMIN','WAREHOUSE_MANAGER'];
export const COMPANY_WIDE_ROLES: readonly Role[] = ['ADMIN'];
export function hasCompanyWideScope(role: Role): boolean { return COMPANY_WIDE_ROLES.includes(role); }
