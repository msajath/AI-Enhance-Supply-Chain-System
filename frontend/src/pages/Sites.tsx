import { useEffect, useState } from 'react';
import { fetchProjects, fetchSites, isCanceled, loadErrorMessage, type Project, type Site } from '../services/organization';
import { EmptyState, ErrorState, LoadingRows, StatusPill } from './orgShared';

/**
 * Sites page with project filter (Jira AESCS-42 / AESCS-163, Member 3).
 * The filter only offers projects the server returned for this user, and the
 * server re-checks the chosen project, so other projects' sites never appear.
 */

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; sites: Site[] };

export function SitesPage({ initialProjectId = '' }: { initialProjectId?: string }) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Projects for the filter. If this fails the filter just stays on "All projects".
  useEffect(() => {
    const controller = new AbortController();
    fetchProjects(controller.signal).then(({ projects }) => setProjects(projects)).catch((error) => { if (!isCanceled(error)) setProjects([]); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchSites(projectId || undefined, controller.signal)
      .then(({ sites }) => setState({ status: 'ready', sites }))
      .catch((error) => { if (!isCanceled(error)) setState({ status: 'error', message: loadErrorMessage(error, 'sites') }); });
    return () => controller.abort();
  }, [projectId, attempt]);

  const selected = projects?.find((p) => p.id === projectId);

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">WORKSPACE · SITES</div>
        <h1>Sites</h1>
        <p>Construction sites in the projects you can access.</p>
      </div>
    </div>
    <section className="panel listing-panel org-panel" aria-busy={state.status === 'loading'} aria-labelledby="sites-title">
      <div className="panel-heading">
        <div>
          <h2 id="sites-title">{selected ? selected.name : 'All sites'}</h2>
          <p>{state.status === 'ready' ? `${state.sites.length} ${state.sites.length === 1 ? 'site' : 'sites'}` : 'Read-only view'}</p>
        </div>
        <label className="filter-select org-filter">
          <span className="org-filter-label">Project</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Filter sites by project" disabled={projects === null}>
            <option value="">All projects</option>
            {projects?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            {projectId && projects && !selected && <option value={projectId}>Selected project</option>}
          </select>
        </label>
      </div>

      {state.status === 'loading' && <LoadingRows label="Loading sites…" columns={4} />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={() => setAttempt((n) => n + 1)} />}
      {state.status === 'ready' && state.sites.length === 0 && (
        <EmptyState title="No sites">{projectId ? 'This project has no sites yet.' : 'There are no sites in your projects yet.'}</EmptyState>
      )}
      {state.status === 'ready' && state.sites.length > 0 && <div className="table-scroll">
        <table className="org-table">
          <thead><tr><th>SITE</th><th>PROJECT</th><th>ADDRESS</th><th>STATUS</th></tr></thead>
          <tbody>{state.sites.map((site) => <tr key={site.id}>
            <td data-label="Site"><strong>{site.name}</strong><small>{site.code}</small></td>
            <td data-label="Project"><strong>{site.projectName}</strong><small>{site.projectCode}</small></td>
            <td data-label="Address">{site.address ?? '—'}</td>
            <td data-label="Status"><StatusPill status={site.status} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>;
}
