import { pool } from '../../config/database';
import type { AuthContext } from '../../middleware/authenticate';
import { hasCompanyWideScope } from '../../auth/permissions';

/**
 * Data access for companies, projects and sites.
 * EVERY query is filtered by the caller's organization_id (from the database, never
 * from the browser) and, for non company-wide roles, by user_project_access.
 * Each statement starts with a `/* qorvenz:<name> *\/` tag so logs and tests can
 * identify it.
 */

export interface AuthUserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  organization_id: string | null;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  siteCount: number;
}

export interface SiteSummary {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  code: string;
  name: string;
  address: string | null;
  status: string;
}

export async function findUserForAuth(userId: string): Promise<AuthUserRow | undefined> {
  const result = await pool.query<AuthUserRow>(
    `/* qorvenz:auth.user */
     SELECT id, email, full_name, role, is_active, organization_id
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

/** Shared scope predicate: $1 organization, $2 company-wide flag, $3 user id. */
const PROJECT_SCOPE = `p.organization_id = $1
  AND ($2::boolean OR EXISTS (
    SELECT 1 FROM user_project_access upa
    WHERE upa.project_id = p.id AND upa.user_id = $3
  ))`;

function scopeParams(auth: AuthContext): [string, boolean, string] {
  return [auth.organizationId, hasCompanyWideScope(auth.role), auth.userId];
}

export async function canAccessProject(auth: AuthContext, projectId: string): Promise<boolean> {
  const result = await pool.query(
    `/* qorvenz:projects.canAccess */
     SELECT 1 FROM projects p WHERE ${PROJECT_SCOPE} AND p.id = $4 LIMIT 1`,
    [...scopeParams(auth), projectId]
  );
  return (result.rowCount ?? 0) > 0;
}

const PROJECT_COLUMNS = `p.id, p.code, p.name, p.status,
  to_char(p.start_date, 'YYYY-MM-DD') AS "startDate",
  to_char(p.end_date, 'YYYY-MM-DD') AS "endDate",
  (SELECT count(*)::int FROM sites s WHERE s.project_id = p.id) AS "siteCount"`;

export async function listAccessibleProjects(auth: AuthContext): Promise<ProjectSummary[]> {
  const result = await pool.query<ProjectSummary>(
    `/* qorvenz:projects.list */
     SELECT ${PROJECT_COLUMNS} FROM projects p WHERE ${PROJECT_SCOPE}
     ORDER BY p.name`,
    scopeParams(auth)
  );
  return result.rows;
}

export async function findAccessibleProject(auth: AuthContext, projectId: string): Promise<ProjectSummary | undefined> {
  const result = await pool.query<ProjectSummary>(
    `/* qorvenz:projects.get */
     SELECT ${PROJECT_COLUMNS} FROM projects p WHERE ${PROJECT_SCOPE} AND p.id = $4`,
    [...scopeParams(auth), projectId]
  );
  return result.rows[0];
}

/** Sites in the caller's projects; optionally narrowed to one (already authorised) project. */
export async function listAccessibleSites(auth: AuthContext, projectId?: string): Promise<SiteSummary[]> {
  const result = await pool.query<SiteSummary>(
    `/* qorvenz:sites.list */
     SELECT s.id, s.project_id AS "projectId", p.code AS "projectCode", p.name AS "projectName",
            s.code, s.name, s.address, s.status
     FROM sites s
     JOIN projects p ON p.id = s.project_id AND p.organization_id = s.organization_id
     WHERE ${PROJECT_SCOPE} AND ($4::uuid IS NULL OR p.id = $4::uuid)
     ORDER BY p.name, s.name`,
    [...scopeParams(auth), projectId ?? null]
  );
  return result.rows;
}

export interface AccessDeniedEvent {
  actorId: string | null;
  reason: string;
  method: string;
  path: string;
  role?: string;
  projectId?: string;
  requiredRoles?: readonly string[];
}

export async function insertAccessDeniedAudit(event: AccessDeniedEvent): Promise<void> {
  const { actorId, ...metadata } = event;
  await pool.query(
    `/* qorvenz:audit.accessDenied */
     INSERT INTO system_audit_logs (actor_id, event_type, module, metadata)
     VALUES ($1, 'ACCESS_DENIED', 'authz', $2::jsonb)`,
    [actorId, JSON.stringify(metadata)]
  );
}
