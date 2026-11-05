import { useEffect, useMemo, useState } from 'react';
import { fetchProjects, isCanceled, loadErrorMessage, type Project, type Scope } from '../services/organization';
import { EmptyState, ErrorState, LoadingRows, SearchIcon, StatusPill } from './orgShared';
import { formatDate, scheduleProgress } from './format';

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
        <h1>Projects</h1>
        <p>{scopeText}</p>
      </div>
    </div>
    <section className="panel org-panel" aria-busy={state.status === 'loading'} aria-labelledby="projects-title">
      <div className="panel-heading">
        <div>
          <h2 id="projects-title">Your projects</h2>
          <p>{state.status === 'ready' ? `${state.projects.length} ${state.projects.length === 1 ? 'project' : 'projects'}` : 'Read-only view'}</p>
        </div>
        <label className="search-box listing-search">
          <SearchIcon />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects" disabled={state.status !== 'ready'} />
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
      {state.status === 'ready' && visible.length > 0 && <ul className="card-grid">
        {visible.map((project) => {
          const schedule = scheduleProgress(project.startDate, project.endDate);
          return <li className="project-card" key={project.id}>
            <div className="card-top"><span className="card-code">{project.code}</span><StatusPill status={project.status} /></div>
            <h3>{project.name}</h3>
            <div className="schedule" aria-label={`Schedule: ${schedule.label}`}>
              <div className="schedule-bar"><span style={{ width: `${schedule.percent}%` }} /></div>
              <div className="schedule-meta"><span>{formatDate(project.startDate)} – {formatDate(project.endDate)}</span><span>{schedule.label}</span></div>
            </div>
            <div className="card-foot">
              <span>{project.siteCount} {project.siteCount === 1 ? 'site' : 'sites'}</span>
              <button type="button" className="button button-outline button-sm" onClick={() => onViewSites(project.id)} aria-label={`View sites for ${project.name}`}>View sites</button>
            </div>
          </li>;
        })}
      </ul>}
    </section>
  </>;
}
