import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiClient } from '../services/api';
import { ProjectsPage } from './Projects';
import { SitesPage } from './Sites';

// Jira AESCS-162 / AESCS-163 (Member 3): loading, empty, error states and project filter.

const P1 = 'e0000000-0000-0000-0000-000000000001';
const P2 = 'e0000000-0000-0000-0000-000000000002';
const projects = [
  { id: P1, code: 'PRJ-CMB-01', name: 'Colombo Tower', status: 'ACTIVE', startDate: '2026-01-15', endDate: '2027-12-31', siteCount: 2 },
  { id: P2, code: 'PRJ-GAL-02', name: 'Galle Interchange', status: 'ON_HOLD', startDate: null, endDate: null, siteCount: 1 },
];
const sites = [
  { id: 's1', projectId: P1, projectCode: 'PRJ-CMB-01', projectName: 'Colombo Tower', code: 'CMB-FDN', name: 'Foundation Works', address: 'Colombo 01', status: 'ACTIVE' },
  { id: 's2', projectId: P1, projectCode: 'PRJ-CMB-01', projectName: 'Colombo Tower', code: 'CMB-POD', name: 'Podium', address: null, status: 'ACTIVE' },
  { id: 's3', projectId: P2, projectCode: 'PRJ-GAL-02', projectName: 'Galle Interchange', code: 'GAL-NTH', name: 'North Ramp', address: 'Galle', status: 'ACTIVE' },
];
const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });
const httpError = (status?: number) => new AxiosError('private SQL details', undefined, undefined, undefined,
  status ? { status, data: {}, statusText: '', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } } : undefined);

const get = vi.spyOn(apiClient, 'get');
type GetConfig = { params?: { projectId?: string } };
function serve({ projectList = projects, siteFailure }: { projectList?: typeof projects; siteFailure?: number } = {}) {
  get.mockImplementation(((url: string, config?: GetConfig) => {
    if (url === '/api/v1/projects') return ok({ projects: projectList, scope: { companyWide: false } });
    if (url === '/api/v1/sites') {
      if (siteFailure) return Promise.reject(httpError(siteFailure));
      const id = config?.params?.projectId;
      return ok({ sites: id ? sites.filter((s) => s.projectId === id) : sites, scope: { companyWide: false } });
    }
    return Promise.reject(httpError(404));
  }) as never);
}
beforeEach(() => { get.mockReset(); });

describe('ProjectsPage', () => {
  it('shows a loading state, then the projects from the API', async () => {
    serve();
    render(<ProjectsPage onViewSites={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects');
    expect(await screen.findByText('Colombo Tower')).toBeVisible();
    expect(screen.getByText('Galle Interchange')).toBeVisible();
    expect(screen.getByText('Projects you have been assigned to.')).toBeVisible();
    expect(get).toHaveBeenCalledWith('/api/v1/projects', expect.objectContaining({ withCredentials: true }));
  });

  it('shows an empty state when the user has no projects', async () => {
    serve({ projectList: [] });
    render(<ProjectsPage onViewSites={() => {}} />);
    expect(await screen.findByText('No projects yet')).toBeVisible();
  });

  it('shows a safe error with a working retry', async () => {
    serve();
    get.mockRejectedValueOnce(httpError(500)); // first load fails, retry uses serve()
    render(<ProjectsPage onViewSites={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("couldn't load projects");
    expect(alert).not.toHaveTextContent(/SQL/);
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Colombo Tower')).toBeVisible();
  });

  it('explains 403 and connection errors', async () => {
    get.mockRejectedValueOnce(httpError(403));
    const { unmount } = render(<ProjectsPage onViewSites={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent("don't have access");
    unmount();
    get.mockRejectedValueOnce(httpError());
    render(<ProjectsPage onViewSites={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect');
  });

  it('filters locally and opens the sites of a project', async () => {
    serve();
    const onViewSites = vi.fn();
    render(<ProjectsPage onViewSites={onViewSites} />);
    await screen.findByText('Colombo Tower');
    await userEvent.type(screen.getByLabelText('Search projects'), 'galle');
    expect(screen.queryByText('Colombo Tower')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View sites for Galle Interchange' }));
    expect(onViewSites).toHaveBeenCalledWith(P2);
  });
});

describe('SitesPage', () => {
  it('lists all sites, then only the chosen project\'s sites', async () => {
    serve();
    render(<SitesPage />);
    expect(await screen.findByText('North Ramp')).toBeVisible();
    expect(screen.getByText('Foundation Works')).toBeVisible();
    const filter = screen.getByLabelText('Filter sites by project');
    await screen.findByRole('option', { name: 'Colombo Tower' });
    await userEvent.selectOptions(filter, P1);
    expect(await screen.findByRole('heading', { name: 'Colombo Tower' })).toBeVisible();
    expect(await screen.findByText('Podium')).toBeVisible();
    expect(screen.queryByText('North Ramp')).not.toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith('/api/v1/sites', expect.objectContaining({ params: { projectId: P1 } }));
  });

  it('starts filtered when opened from a project', async () => {
    serve();
    render(<SitesPage initialProjectId={P2} />);
    expect(await screen.findByText('North Ramp')).toBeVisible();
    expect(screen.queryByText('Foundation Works')).not.toBeInTheDocument();
  });

  it('only offers projects the server returned in the filter', async () => {
    serve({ projectList: [projects[0]] });
    render(<SitesPage />);
    await screen.findByRole('option', { name: 'Colombo Tower' });
    expect(screen.queryByRole('option', { name: 'Galle Interchange' })).not.toBeInTheDocument();
  });

  it('shows an access message when the server refuses the project', async () => {
    serve({ siteFailure: 403 });
    render(<SitesPage initialProjectId={P2} />);
    expect(await screen.findByRole('alert')).toHaveTextContent("don't have access to these sites");
  });

  it('shows an empty state for a project without sites', async () => {
    get.mockImplementation(((url: string) => url === '/api/v1/projects'
      ? ok({ projects, scope: { companyWide: true } })
      : ok({ sites: [], scope: { companyWide: true } })) as never);
    render(<SitesPage initialProjectId={P1} />);
    expect(await screen.findByText('This project has no sites yet.')).toBeVisible();
  });
});
