import { useEffect, useMemo, useState } from 'react';
import { fetchProjects, isCanceled, loadErrorMessage, type Project, type Scope } from '../services/organization';
import { EmptyState, ErrorState, LoadingRows, SearchIcon, StatusPill } from './orgShared';
import { formatDate } from './format';

/**
 * Projects page (Jira AESCS-42 / AESCS-162, Member 3).
 * Read-only list of the projects the server says this user may see, with
 * loading, empty, error and "no search match" states.
 */

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; projects: Project[]; scope: Scope };

export function ProjectsPage({ onViewSites }: { onViewSites: (projectId: string) => void }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchProjects(controller.signal)
      .then(({ projects, scope }) => setState({ status: 'ready', projects, scope }))
      .catch((error) => { if (!isCanceled(error)) setState({ status: 'error', message: loadErrorMessage(error, 'projects') }); });
    return () => controller.abort();
  }, [attempt]);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return q ? state.projects.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(q)) : state.projects;
  }, [state, query]);

  const scopeText = state.status === 'ready'
    ? state.scope.companyWide ? 'All projects in your company.' : 'Projects you have been assigned to.'
    : 'Construction projects and their sites.';

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">WORKSPACE · PROJECTS</div>
        <h1>Projects</h1>
        <p>{scopeText}</p>
      </div>
    </div>
    <section className="panel listing-panel org-panel" aria-busy={state.status === 'loading'} aria-labelledby="projects-title">
      <div className="panel-heading">
        <div>
          <h2 id="projects-title">Your projects</h2>
          <p>{state.status === 'ready' ? `${state.projects.length} ${state.projects.length === 1 ? 'project' : 'projects'}` : 'Read-only view'}</p>
        </div>
        <label className="search-box listing-search">
          <SearchIcon />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects..." aria-label="Search projects" disabled={state.status !== 'ready'} />
        </label>
      </div>

      {state.status === 'loading' && <LoadingRows label="Loading projects…" columns={5} />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={() => setAttempt((n) => n + 1)} />}
      {state.status === 'ready' && state.projects.length === 0 && (
        <EmptyState title="No projects yet">You haven&apos;t been assigned to a project. Ask your administrator for access.</EmptyState>
      )}
      {state.status === 'ready' && state.projects.length > 0 && visible.length === 0 && (
        <EmptyState title="No matches">No projects match &ldquo;{query}&rdquo;.</EmptyState>
      )}
      {state.status === 'ready' && visible.length > 0 && <div className="table-scroll">
        <table className="org-table">
          <thead><tr><th>PROJECT</th><th>STATUS</th><th>SCHEDULE</th><th>SITES</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>{visible.map((project) => <tr key={project.id}>
            <td data-label="Project"><strong>{project.name}</strong><small>{project.code}</small></td>
            <td data-label="Status"><StatusPill status={project.status} /></td>
            <td data-label="Schedule">{formatDate(project.startDate)} – {formatDate(project.endDate)}</td>
            <td data-label="Sites"><span className="count-chip">{project.siteCount}</span></td>
            <td className="org-actions">
              <button type="button" className="text-button" onClick={() => onViewSites(project.id)} aria-label={`View sites for ${project.name}`}>
                View sites <span aria-hidden="true">→</span>
              </button>
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>;
}
