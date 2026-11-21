import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiClient } from '../services/api';
import { ProjectForm, SiteForm } from './ProjectForm';
import ProjectManagementPage from './ProjectForm';

const P1 = 'e0000000-0000-0000-0000-000000000001';
const P2 = 'e0000000-0000-0000-0000-000000000002';
const mockProjects = [
  { id: P1, code: 'PRJ-CMB-01', name: 'Colombo Commercial Center', status: 'ACTIVE', startDate: '2026-01-01', endDate: '2027-12-31', siteCount: 2 },
  { id: P2, code: 'PRJ-GAL-02', name: 'Galle Logistics Hub', status: 'PLANNED', startDate: null, endDate: null, siteCount: 0 },
];

const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });
const httpError = (status: number, message = 'Access denied') =>
  new AxiosError(message, undefined, undefined, undefined, {
    status,
    data: { success: false, error: message },
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  });

describe('ProjectForm (AESCS-44)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects submission when required fields (code, name) are missing', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    render(<ProjectForm />);

    const submitBtn = screen.getByRole('button', { name: /create project/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText('Project code is required.')).toBeInTheDocument();
    expect(screen.getByText('Project name is required.')).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('rejects submission when end date precedes start date', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    render(<ProjectForm />);

    await userEvent.type(screen.getByLabelText(/project code/i), 'PRJ-TEST-01');
    await userEvent.type(screen.getByLabelText(/project name/i), 'Test Project');
    await userEvent.type(screen.getByLabelText(/^start date/i), '2026-06-01');
    await userEvent.type(screen.getByLabelText(/^end date/i), '2026-05-01');

    const submitBtn = screen.getByRole('button', { name: /create project/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText('Project end date cannot precede its start date.')).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('successfully creates a valid project through the API', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockReturnValue(
      ok({
        row: {
          id: 'p-new-123',
          code: 'PRJ-NEW-01',
          name: 'New Harbor Facility',
          status: 'ACTIVE',
          start_date: '2026-02-01',
          end_date: '2027-02-01',
        },
      }) as never
    );

    const onSuccess = vi.fn();
    render(<ProjectForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/project code/i), 'PRJ-NEW-01');
    await userEvent.type(screen.getByLabelText(/project name/i), 'New Harbor Facility');
    await userEvent.type(screen.getByLabelText(/^start date/i), '2026-02-01');
    await userEvent.type(screen.getByLabelText(/^end date/i), '2027-02-01');

    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/admin/projects',
        expect.objectContaining({
          code: 'PRJ-NEW-01',
          name: 'New Harbor Facility',
          status: 'ACTIVE',
          start_date: '2026-02-01',
          end_date: '2027-02-01',
        }),
        expect.objectContaining({ withCredentials: true })
      );
    });

    expect(await screen.findByText('Project created successfully.')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('displays error and handles 403 unauthorized project creation', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(httpError(403, 'Permission denied: projects.manage required'));

    render(<ProjectForm />);
    await userEvent.type(screen.getByLabelText(/project code/i), 'PRJ-DENIED');
    await userEvent.type(screen.getByLabelText(/project name/i), 'Forbidden Project');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i);
  });
});

describe('SiteForm (AESCS-44)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects submission when parent project or code or name is missing', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    render(<SiteForm projects={mockProjects} />);

    await userEvent.click(screen.getByRole('button', { name: /create site/i }));

    expect(screen.getByText('Parent project is required.')).toBeInTheDocument();
    expect(screen.getByText('Site code is required.')).toBeInTheDocument();
    expect(screen.getByText('Site name is required.')).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('successfully creates a valid site under an authorized parent project', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockReturnValue(
      ok({
        row: {
          id: 'site-new-1',
          project_id: P1,
          code: 'CMB-POD-02',
          name: 'Podium Phase 2',
          address: 'Colombo Port City',
          status: 'ACTIVE',
        },
      }) as never
    );

    const onSuccess = vi.fn();
    render(<SiteForm projects={mockProjects} onSuccess={onSuccess} />);

    await userEvent.selectOptions(screen.getByLabelText(/parent project/i), P1);
    await userEvent.type(screen.getByLabelText(/site code/i), 'CMB-POD-02');
    await userEvent.type(screen.getByLabelText(/site name/i), 'Podium Phase 2');
    await userEvent.type(screen.getByLabelText(/site address/i), 'Colombo Port City');

    await userEvent.click(screen.getByRole('button', { name: /create site/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/admin/sites',
        expect.objectContaining({
          project_id: P1,
          code: 'CMB-POD-02',
          name: 'Podium Phase 2',
          address: 'Colombo Port City',
          status: 'ACTIVE',
        }),
        expect.objectContaining({ withCredentials: true })
      );
    });

    expect(await screen.findByText('Site created successfully.')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('renders ProjectManagementPage tabs and switches between Project and Site forms', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok({ projects: mockProjects, scope: { companyWide: true } }) as never);
    render(<ProjectManagementPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New Project');
    expect(screen.getByLabelText(/project code/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Site Form' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New Site');
    expect(screen.getByLabelText(/parent project/i)).toBeInTheDocument();
  });
});
