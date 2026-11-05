/**
 * Roles and permissions, server side. Single source of truth for the role guard.
 * Mirrors docs/sprint-01/05-permission-matrix-and-api-draft.md (§1, "Company / project /
 * site / warehouse setup" row). New SRS roles get added here once Q-402 is answered.
 */
export const ROLES = ['ADMIN', 'WAREHOUSE_MANAGER', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  WAREHOUSE_MANAGER: 'Warehouse manager',
  DRIVER: 'Driver',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Roles that may read project / site master data (R or R(s) in the matrix). */
export const PROJECT_READ_ROLES: readonly Role[] = ['ADMIN', 'WAREHOUSE_MANAGER'];

/**
 * Roles whose scope is the whole company. Every other role only sees projects it
 * has been explicitly granted in user_project_access (the "(s)" in the matrix).
 */
export const COMPANY_WIDE_ROLES: readonly Role[] = ['ADMIN'];

export function hasCompanyWideScope(role: Role): boolean {
  return COMPANY_WIDE_ROLES.includes(role);
}
