import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiClient } from '../services/api';
import { SuppliersPage } from './Suppliers';

const mockSuppliers = [
  {
    id: 'sup-1',
    code: 'SUP-TOKYO-01',
    name: 'Tokyo Cement Lanka PLC',
    contact_person: 'Nimal Perera',
    email: 'nimal@tokyocement.test',
    phone: '+94 11 257 8900',
    address: '469 Kandy Rd, Peliyagoda',
    status: 'ACTIVE' as const,
  },
  {
    id: 'sup-2',
    code: 'SUP-MELWA-02',
    name: 'Melwire Rolling Mills',
    contact_person: 'Ruwan Fernando',
    email: 'ruwan@melwire.test',
    phone: '+94 11 482 1200',
    address: 'Biyagama EPZ, Sri Lanka',
    status: 'ACTIVE' as const,
  },
  {
    id: 'sup-3',
    code: 'SUP-SUSP-03',
    name: 'Old Quarry Sands Ltd',
    contact_person: 'Sunil Silva',
    email: 'sunil@oldquarry.test',
    phone: '+94 34 225 1111',
    address: 'Kalutara',
    status: 'SUSPENDED' as const,
  },
];

const mockPricingHistory = [
  {
    id: 'ph-1',
    supplier_id: 'sup-1',
    material_id: 'm-1',
    material_code: 'MAT-CMT-01',
    material_name: 'Portland Cement Grade 43',
    unit: 'bags',
    unit_price: 2450.0,
    effective_date: '2026-01-01',
    expiry_date: '2026-06-30',
    note: 'Q1 Bulk Framework Agreement',
  },
  {
    id: 'ph-2',
    supplier_id: 'sup-1',
    material_id: 'm-1',
    material_code: 'MAT-CMT-01',
    material_name: 'Portland Cement Grade 43',
    unit: 'bags',
    unit_price: 2600.0,
    effective_date: '2026-07-01',
    expiry_date: null,
    note: 'Q3 Tariff Adjustment',
  },
];

const ok = (rows: unknown) => Promise.resolve({ data: { success: true, data: { rows } } });
const httpError = (status: number, message = 'Access denied') =>
  new AxiosError(message, undefined, undefined, undefined, {
    status,
    data: { success: false, error: message },
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  });

describe('SuppliersPage (AESCS-52)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays supplier directory with status and contact details', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockSuppliers) as never);
    render(<SuppliersPage />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading supplier directory/i);
    expect(await screen.findByText('Tokyo Cement Lanka PLC')).toBeInTheDocument();
    expect(screen.getByText('Nimal Perera')).toBeInTheDocument();
    expect(screen.getByText('nimal@tokyocement.test')).toBeInTheDocument();
    expect(screen.getByText('+94 11 257 8900')).toBeInTheDocument();
    expect(screen.getByText('Melwire Rolling Mills')).toBeInTheDocument();
  });

  it('filters suppliers by keyword and status', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockSuppliers) as never);
    render(<SuppliersPage />);

    await screen.findByText('Tokyo Cement Lanka PLC');

    // Filter by keyword
    await userEvent.type(screen.getByLabelText(/search suppliers/i), 'melwire');
    expect(screen.getByText('Melwire Rolling Mills')).toBeInTheDocument();
    expect(screen.queryByText('Tokyo Cement Lanka PLC')).not.toBeInTheDocument();

    // Reset and filter by status
    await userEvent.click(screen.getByRole('button', { name: /reset search filters/i }));
    expect(screen.getByText('Tokyo Cement Lanka PLC')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'SUSPENDED');
    expect(screen.getByText('Old Quarry Sands Ltd')).toBeInTheDocument();
    expect(screen.queryByText('Tokyo Cement Lanka PLC')).not.toBeInTheDocument();
  });

  it('opens date-scoped pricing history modal and loads historical pricing', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(((url: string) => {
      if (url === '/api/v1/procurement/suppliers') return ok(mockSuppliers);
      if (url.includes('/pricing-history')) return ok(mockPricingHistory);
      return Promise.reject(httpError(404));
    }) as never);

    render(<SuppliersPage />);
    await screen.findByText('Tokyo Cement Lanka PLC');

    const pricingBtn = screen.getByRole('button', { name: /view pricing history for tokyo cement lanka plc/i });
    await userEvent.click(pricingBtn);

    expect(screen.getByRole('dialog', { name: /pricing history/i })).toBeInTheDocument();
    expect(await screen.findByText('$2450.00 / bags')).toBeInTheDocument();
    expect(screen.getByText('Q1 Bulk Framework Agreement')).toBeInTheDocument();
    expect(screen.getByText('$2600.00 / bags')).toBeInTheDocument();

    // Change date window
    await userEvent.type(screen.getByLabelText(/pricing history start date/i), '2026-01-01');
    await userEvent.type(screen.getByLabelText(/pricing history end date/i), '2026-06-30');

    await waitFor(() => {
      expect(getSpy).toHaveBeenLastCalledWith(
        '/api/v1/procurement/suppliers/sup-1/pricing-history',
        expect.objectContaining({
          params: { start_date: '2026-01-01', end_date: '2026-06-30' },
          withCredentials: true,
        })
      );
    });
  });

  it('rejects invalid date range when end date precedes start date', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(((url: string) => {
      if (url === '/api/v1/procurement/suppliers') return ok(mockSuppliers);
      if (url.includes('/pricing-history')) return ok(mockPricingHistory);
      return Promise.reject(httpError(404));
    }) as never);

    render(<SuppliersPage />);
    await screen.findByText('Tokyo Cement Lanka PLC');
    await userEvent.click(screen.getByRole('button', { name: /view pricing history for tokyo cement lanka plc/i }));

    await userEvent.type(screen.getByLabelText(/pricing history start date/i), '2026-06-01');
    await userEvent.type(screen.getByLabelText(/pricing history end date/i), '2026-01-01');

    expect(await screen.findByRole('alert')).toHaveTextContent(/end date cannot precede start date/i);
  });

  it('enforces permission controls and displays 403 access denied cleanly', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockSuppliers) as never);
    render(<SuppliersPage canViewPricing={false} />);

    await screen.findByText('Tokyo Cement Lanka PLC');
    await userEvent.click(screen.getByRole('button', { name: /view pricing history for tokyo cement lanka plc/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission to view supplier pricing history/i);
  });
});
