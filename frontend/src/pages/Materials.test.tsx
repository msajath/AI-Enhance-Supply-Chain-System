import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiClient } from '../services/api';
import { MaterialsPage } from './Materials';

const mockMaterials = [
  { id: 'm1', code: 'MAT-CMT-01', name: 'Portland Cement Grade 43', unit: 'bags', category: 'Cement', reorder_level: 100 },
  { id: 'm2', code: 'MAT-STL-16', name: 'Reinforcement Steel 16mm', unit: 'tons', category: 'Steel', reorder_level: 25 },
  { id: 'm3', code: 'MAT-SND-01', name: 'River Sand Fine', unit: 'm3', category: 'Aggregates', reorder_level: 50 },
  { id: 'm4', code: 'MAT-STL-12', name: 'Reinforcement Steel 12mm', unit: 'tons', category: 'Steel', reorder_level: 30 },
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

describe('MaterialsPage (AESCS-49)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays materials from the backend', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockMaterials) as never);
    render(<MaterialsPage />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading materials/i);
    expect(await screen.findByText('Portland Cement Grade 43')).toBeInTheDocument();
    expect(screen.getByText('Reinforcement Steel 16mm')).toBeInTheDocument();
    expect(screen.getByText('River Sand Fine')).toBeInTheDocument();
  });

  it('filters materials by keyword (name and code)', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockMaterials) as never);
    render(<MaterialsPage />);

    await screen.findByText('Portland Cement Grade 43');

    const searchInput = screen.getByLabelText(/search materials/i);
    await userEvent.type(searchInput, 'stl');

    await waitFor(() => {
      expect(screen.getByText('Reinforcement Steel 16mm')).toBeInTheDocument();
      expect(screen.getByText('Reinforcement Steel 12mm')).toBeInTheDocument();
      expect(screen.queryByText('Portland Cement Grade 43')).not.toBeInTheDocument();
      expect(screen.queryByText('River Sand Fine')).not.toBeInTheDocument();
    });
  });

  it('filters materials by category dropdown', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockMaterials) as never);
    render(<MaterialsPage />);

    await screen.findByText('Portland Cement Grade 43');

    const categorySelect = screen.getByLabelText(/filter by category/i);
    await userEvent.selectOptions(categorySelect, 'Cement');

    await waitFor(() => {
      expect(screen.getByText('Portland Cement Grade 43')).toBeInTheDocument();
      expect(screen.queryByText('Reinforcement Steel 16mm')).not.toBeInTheDocument();
    });
  });

  it('combines keyword and category filtering', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockMaterials) as never);
    render(<MaterialsPage />);

    await screen.findByText('Portland Cement Grade 43');

    await userEvent.selectOptions(screen.getByLabelText(/filter by category/i), 'Steel');
    await userEvent.type(screen.getByLabelText(/search materials/i), '16mm');

    await waitFor(() => {
      expect(screen.getByText('Reinforcement Steel 16mm')).toBeInTheDocument();
      expect(screen.queryByText('Reinforcement Steel 12mm')).not.toBeInTheDocument();
      expect(screen.queryByText('Portland Cement Grade 43')).not.toBeInTheDocument();
    });
  });

  it('resets filters cleanly', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockMaterials) as never);
    render(<MaterialsPage />);

    await screen.findByText('Portland Cement Grade 43');
    await userEvent.type(screen.getByLabelText(/search materials/i), 'sand');

    await waitFor(() => {
      expect(screen.queryByText('Portland Cement Grade 43')).not.toBeInTheDocument();
    });

    const resetBtn = screen.getByRole('button', { name: /reset filters/i });
    await userEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.getByText('Portland Cement Grade 43')).toBeInTheDocument();
      expect(screen.getByText('River Sand Fine')).toBeInTheDocument();
    });
  });

  it('handles pagination and page navigation', async () => {
    const manyMaterials = Array.from({ length: 15 }, (_, i) => ({
      id: `m-${i}`,
      code: `MAT-${i}`,
      name: `Material Item ${i + 1}`,
      unit: 'kg',
      category: 'General',
      reorder_level: 10,
    }));

    vi.spyOn(apiClient, 'get').mockReturnValue(ok(manyMaterials) as never);
    render(<MaterialsPage />);

    expect(await screen.findByText('Material Item 1')).toBeInTheDocument();
    expect(screen.getByText('Material Item 10')).toBeInTheDocument();
    expect(screen.queryByText('Material Item 11')).not.toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /next page/i });
    await userEvent.click(nextBtn);

    expect(await screen.findByText('Material Item 11')).toBeInTheDocument();
    expect(screen.queryByText('Material Item 1')).not.toBeInTheDocument();
  });

  it('renders meaningful empty state when search finds no matches', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockMaterials) as never);
    render(<MaterialsPage />);

    await screen.findByText('Portland Cement Grade 43');
    await userEvent.type(screen.getByLabelText(/search materials/i), 'nonexistentxyz');

    expect(await screen.findByText(/no matching materials/i)).toBeInTheDocument();
  });

  it('renders error state and handles retry on network failure', async () => {
    const getSpy = vi.spyOn(apiClient, 'get')
      .mockRejectedValueOnce(httpError(500, 'Server error'))
      .mockReturnValueOnce(ok(mockMaterials) as never);

    render(<MaterialsPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await userEvent.click(retryBtn);

    expect(await screen.findByText('Portland Cement Grade 43')).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('registers a new material via modal when authorized', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(mockMaterials) as never);
    const postSpy = vi.spyOn(apiClient, 'post').mockReturnValue(
      Promise.resolve({
        data: {
          success: true,
          data: {
            row: { id: 'm-new', code: 'MAT-NEW', name: 'New Timber', unit: 'pcs', category: 'Timber', reorder_level: 20 },
          },
        },
      }) as never
    );

    render(<MaterialsPage canRegister />);
    await screen.findByText('Portland Cement Grade 43');

    await userEvent.click(screen.getByRole('button', { name: /register new material/i }));
    expect(screen.getByRole('heading', { name: /register material/i })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/material code \*/i), 'MAT-NEW');
    await userEvent.type(screen.getByLabelText(/material name \*/i), 'New Timber');
    await userEvent.type(screen.getByLabelText(/unit of measure \*/i), 'pcs');
    await userEvent.type(screen.getByLabelText(/category \*/i), 'Timber');

    await userEvent.click(screen.getByRole('button', { name: /save material/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/warehouse/materials',
        expect.objectContaining({
          code: 'MAT-NEW',
          name: 'New Timber',
          unit: 'pcs',
          category: 'Timber',
        }),
        expect.objectContaining({ withCredentials: true })
      );
    });
  });
});
