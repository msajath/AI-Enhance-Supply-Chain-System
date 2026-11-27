import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiClient } from '../services/api';
import { RequisitionsPage } from './Requisitions';

const mockProjects = [
  { id: 'p1', code: 'PRJ-CMB-01', name: 'Colombo Commercial Center', status: 'ACTIVE', startDate: null, endDate: null, siteCount: 1 },
  { id: 'p2', code: 'PRJ-GAL-02', name: 'Galle Logistics Hub', status: 'ACTIVE', startDate: null, endDate: null, siteCount: 0 },
];

const mockMaterials = [
  { id: 'm1', code: 'MAT-CMT-01', name: 'Portland Cement Grade 43', unit: 'bags', category: 'Cement', reorder_level: 100 },
  { id: 'm2', code: 'MAT-STL-16', name: 'Reinforcement Steel 16mm', unit: 'tons', category: 'Steel', reorder_level: 25 },
];

const mockQueue = [
  {
    id: 'req-app-1',
    requisition_id: 'pr-101',
    requisition_code: 'PR-2026-001',
    project_name: 'Colombo Commercial Center',
    requester_name: 'Sunil Perera',
    approver_id: 'u-approver-1',
    approver_role: 'PROJECT_MANAGER',
    status: 'PENDING' as const,
    total_items: 2,
    required_by_date: '2026-12-01',
    created_at: '2026-11-20T10:00:00Z',
    items: [
      { material_id: 'm1', material_code: 'MAT-CMT-01', material_name: 'Portland Cement Grade 43', unit: 'bags', quantity: 250 },
      { material_id: 'm2', material_code: 'MAT-STL-16', material_name: 'Reinforcement Steel 16mm', unit: 'tons', quantity: 15 },
    ],
  },
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

describe('RequisitionsPage (AESCS-56)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMocks() {
    vi.spyOn(apiClient, 'get').mockImplementation(((url: string) => {
      if (url === '/api/v1/projects') return ok({ projects: mockProjects, scope: { companyWide: true } });
      if (url === '/api/v1/sites') return ok({ sites:[{id:'s1',projectId:'p1',projectCode:'PRJ-CMB-01',projectName:'Colombo Commercial Center',code:'S1',name:'Colombo Site',address:null,status:'ACTIVE'}],scope:{companyWide:true} });
      if (url === '/api/v1/procurement/materials') return ok({ rows: mockMaterials });
      if (url === '/api/v1/procurement/approvals/queue') return ok({ rows: mockQueue });
      if (url === '/api/v1/procurement/requisitions?view=workspace') return ok({ rows: [] });
      return Promise.reject(httpError(404));
    }) as never);
  }

  it('renders multi-line creation form and validates missing project or date', async () => {
    setupMocks();
    render(<RequisitionsPage />);

    expect(screen.getByRole('heading', { name: /create purchase requisition/i })).toBeInTheDocument();
    await screen.findByRole('option', { name: /colombo/i });

    const submitBtn = screen.getByRole('button', { name: /submit requisition/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText('Project is required.')).toBeInTheDocument();
    expect(screen.getByText('Required-by date is required.')).toBeInTheDocument();
  });

  it('validates that quantity must be greater than zero and material is selected', async () => {
    setupMocks();
    render(<RequisitionsPage />);

    await screen.findByRole('option', { name: /colombo commercial center/i });

    // Set valid date
    await userEvent.type(screen.getByLabelText(/required by date/i), '2026-12-15');

    // Attempt submit without selecting material
    await userEvent.click(screen.getByRole('button', { name: /submit requisition/i }));
    expect(await screen.findByText(/line 1: please select a material/i)).toBeInTheDocument();

    // Select material and set quantity to 0
    await userEvent.selectOptions(screen.getByLabelText(/material selection for line 1/i), 'm1');
    const qtyInput = screen.getByLabelText(/quantity for line 1/i);
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, '0');

    await userEvent.click(screen.getByRole('button', { name: /submit requisition/i }));
    expect(await screen.findByText(/line 1: quantity must be greater than zero/i)).toBeInTheDocument();
  });

  it('allows adding and removing material lines', async () => {
    setupMocks();
    render(<RequisitionsPage />);

    await screen.findByRole('option', { name: /colombo commercial center/i });

    expect(screen.getAllByLabelText(/material selection for line/i)).toHaveLength(1);

    // Add second line
    await userEvent.click(screen.getByRole('button', { name: /add material line/i }));
    expect(screen.getAllByLabelText(/material selection for line/i)).toHaveLength(2);

    // Remove second line
    await userEvent.click(screen.getByRole('button', { name: /remove line 2/i }));
    expect(screen.getAllByLabelText(/material selection for line/i)).toHaveLength(1);
  });

  it('submits a multi-line requisition successfully through the API', async () => {
    setupMocks();
    const postSpy = vi.spyOn(apiClient, 'post').mockReturnValue(
      Promise.resolve({
        data: {
          success: true,
          data: {
            row: {
              id: 'pr-new-1',
              code: 'PR-2026-999',
              project_id: 'p1',
              project_name: 'Colombo Commercial Center',
              requester_id: 'u-1',
              requester_name: 'Jane Doe',
              required_by_date: '2026-12-25',
              status: 'PENDING_APPROVAL',
              items: [{ material_id: 'm1', quantity: 50, material_code: 'MAT-CMT-01', material_name: 'Cement', unit: 'bags' }],
              created_at: new Date().toISOString(),
            },
          },
        },
      }) as never
    );

    render(<RequisitionsPage />);

    await screen.findByRole('option', { name: /colombo commercial center/i });
    await userEvent.selectOptions(screen.getByLabelText(/project \*/i), 'p1');
    await userEvent.type(screen.getByLabelText(/required by date/i), '2026-12-25');
    await userEvent.selectOptions(screen.getByLabelText(/material selection for line 1/i), 'm1');
    const qtyInput = screen.getByLabelText(/quantity for line 1/i);
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, '50');
    await userEvent.selectOptions(screen.getByLabelText('Requisition site'),'s1');
    await userEvent.type(screen.getByLabelText('Estimated unit price for line 1'),'100');

    await userEvent.click(screen.getByRole('button', { name: /submit requisition/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/procurement/requisitions',
        expect.objectContaining({
          project_id: 'p1',
          required_by_date: '2026-12-25',
          items: [{ material_id: 'm1', quantity: 50, estimated_unit_price:100 }],
        }),
        expect.objectContaining({ withCredentials: true })
      );
    });

    expect(await screen.findByText(/requisition pr-2026-999 submitted successfully/i)).toBeInTheDocument();
  });

  it('loads approver queue and processes approval decision', async () => {
    setupMocks();
    const postSpy = vi.spyOn(apiClient, 'post').mockReturnValue(
      Promise.resolve({ data: { success: true } }) as never
    );

    render(<RequisitionsPage isApprover />);

    expect(await screen.findByText('PR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Sunil Perera')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();

    // Click Review & Decide
    await userEvent.click(screen.getByRole('button', { name: /review and approve pr-2026-001/i }));

    // Review modal opened
    expect(screen.getByRole('dialog', { name: /approve requisition/i })).toBeInTheDocument();
    expect(screen.getByText('Portland Cement Grade 43')).toBeInTheDocument();
    expect(screen.getByText('Reinforcement Steel 16mm')).toBeInTheDocument();

    // Confirm approval
    await userEvent.click(screen.getByRole('button', { name: /confirm approval/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/procurement/approvals/req-app-1/approve',
        expect.objectContaining({ comments: null }),
        expect.objectContaining({ withCredentials: true })
      );
    });
  });

  it('does not expose approval actions to a requester', async () => {
    setupMocks(); render(<RequisitionsPage />);
    expect(screen.queryByRole('button',{name:/approval queue/i})).not.toBeInTheDocument();
  });

  it('supports an approver-only workspace without create/list or material reference requests', async () => {
    setupMocks(); render(<RequisitionsPage isApprover canCreate={false} canList={false}/>);
    await screen.findByText('PR-2026-001');
    expect(screen.queryByRole('button',{name:/new requisition/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/my requisitions/i})).not.toBeInTheDocument();
    expect(vi.mocked(apiClient.get).mock.calls.some(([url])=>url==='/api/v1/warehouse/materials')).toBe(false);
  });

  it('reports failed reference requests instead of pretending there are no materials', async () => {
    vi.spyOn(apiClient,'get').mockRejectedValue(httpError(503)); render(<RequisitionsPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('requires rejection comment when rejecting a requisition', async () => {
    setupMocks();
    render(<RequisitionsPage isApprover />);

    await screen.findByText('PR-2026-001');
    await userEvent.click(screen.getByRole('button', { name: /review and approve pr-2026-001/i }));

    // Switch decision action to reject
    await userEvent.click(screen.getByRole('button', { name: 'Reject Requisition' }));

    // Click confirm without comment
    await userEvent.click(screen.getByRole('button', { name: /confirm rejection/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejection reason is required/i);
  });
});
