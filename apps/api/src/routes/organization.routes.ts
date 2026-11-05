import { Router, type Request, type RequestHandler } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { PROJECT_READ_ROLES, hasCompanyWideScope } from '../auth/permissions';
import { requireAuth } from '../middleware/authenticate';
import { requireProjectAccess, requireRole } from '../middleware/authorize';
import {
  findAccessibleProject,
  listAccessibleProjects,
  listAccessibleSites,
} from '../modules/organization/organization.repository';

/**
 * Read-only project & site endpoints (Jira AESCS-39, AESCS-42).
 *   GET /api/v1/projects                     projects in the caller's scope
 *   GET /api/v1/projects/:projectId          one project (403 if out of scope)
 *   GET /api/v1/projects/:projectId/sites    sites of one project (403 if out of scope)
 *   GET /api/v1/sites[?projectId=<uuid>]     sites in scope, optionally filtered by project
 */

type Handler = (req: Request, res: Parameters<RequestHandler>[1]) => Promise<void>;

// Converts unexpected repository errors into a safe 503 without leaking SQL.
const safe = (handler: Handler): RequestHandler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    logger.error(`Organization route failed: ${req.method} ${req.originalUrl}`, { error: (error as Error).message });
    res.status(503).json(ApiResponse.error('This service is temporarily unavailable.', 'SERVICE_UNAVAILABLE'));
  }
};

const scopeOf = (req: Request) => ({ companyWide: hasCompanyWideScope(req.auth!.role) });
const projectIdParam = (req: Request) => req.params.projectId;
const projectIdQuery = (req: Request) => (typeof req.query.projectId === 'string' ? req.query.projectId : req.query.projectId === undefined ? undefined : 'invalid');

export function createOrganizationRouter(sessionMiddleware: RequestHandler): Router {
  const router = Router();
  const canRead = requireRole(...PROJECT_READ_ROLES);

  router.use(['/projects', '/sites'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  }, sessionMiddleware, requireAuth);

  router.get('/projects', canRead, safe(async (req, res) => {
    const projects = await listAccessibleProjects(req.auth!);
    res.json(ApiResponse.success({ projects, scope: scopeOf(req) }));
  }));

  router.get('/projects/:projectId', canRead, requireProjectAccess(projectIdParam), safe(async (req, res) => {
    const project = await findAccessibleProject(req.auth!, req.params.projectId);
    if (!project) {
      // Access was checked a moment ago; the row was deleted in between.
      res.status(404).json(ApiResponse.error('Project not found.', 'NOT_FOUND'));
      return;
    }
    res.json(ApiResponse.success({ project }));
  }));

  router.get('/projects/:projectId/sites', canRead, requireProjectAccess(projectIdParam), safe(async (req, res) => {
    const sites = await listAccessibleSites(req.auth!, req.params.projectId);
    res.json(ApiResponse.success({ sites, scope: scopeOf(req) }));
  }));

  router.get('/sites', canRead, requireProjectAccess(projectIdQuery, { optional: true }), safe(async (req, res) => {
    const sites = await listAccessibleSites(req.auth!, projectIdQuery(req));
    res.json(ApiResponse.success({ sites, scope: scopeOf(req) }));
  }));

  return router;
}
