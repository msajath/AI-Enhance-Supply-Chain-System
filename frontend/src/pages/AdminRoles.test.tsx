
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { read, write } from '../services/management';
import { AdminRolesPage } from './AdminRoles';

vi.mock('../services/management', () => ({
  read: vi.fn(),
  write: vi.fn(),
  errorMessage: vi.fn(() => 'Request failed.'),
}));

const roles = [
  {
    id: 'ADMIN',
    name: 'Admin',
    permissions: ['users.read', 'users.update'],
  },
  {
    id: 'WAREHOUSE_MANAGER',
    name: 'Warehouse manager',
    permissions: ['inventory.read'],
  },
];

const users = [
  {
    id: 'self',
    full_name: 'Current Admin',
    email: 'admin@example.test',
    role: 'ADMIN',
    is_active: true,
  },
  {
    id: 'other',
    full_name: 'Jane Doe',
    email: 'jane@example.test',
    role: 'WAREHOUSE_MANAGER',
    is_active: true,
  },
];

function renderPage(canUpdate = true) {
  return render(
    <MemoryRouter>
      <AdminRolesPage
        currentUserId="self"
        canUpdate={canUpdate}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(read).mockImplementation(async (path) => {
    if (path === 'admin/roles') {
      return { rows: roles } as never;
    }

    if (path === 'admin/users') {
      return { rows: users } as never;
    }

    throw new Error('Unexpected API request');
  });

  vi.mocked(write).mockResolvedValue(undefined);
});

describe('AESCS-190 role administration', () => {
  it('loads roles, permissions and assigned users', async () => {
    renderPage();

    expect(
      await screen.findByRole('row', { name: /Jane Doe/ }),
    ).toBeInTheDocument();

    expect(screen.getByText('users.update')).toBeInTheDocument();
    expect(screen.getByText('inventory.read')).toBeInTheDocument();

    expect(read).toHaveBeenCalledWith('admin/roles');
    expect(read).toHaveBeenCalledWith('admin/users');
  });

  it('requires confirmation before changing a role', async () => {
    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByRole('row', { name: /Jane Doe/ });

    await user.click(
      within(row).getByRole('button', { name: 'Change role' }),
    );

    expect(write).not.toHaveBeenCalled();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'New role' }),
      'ADMIN',
    );

    await user.click(
      screen.getByRole('button', { name: 'Confirm role change' }),
    );

    await waitFor(() => {
      expect(write).toHaveBeenCalledWith(
        'admin/users/other',
        { role: 'ADMIN' },
        'patch',
      );
    });
  });

  it('prevents changing your own role', async () => {
    renderPage();

    const row = await screen.findByRole('row', {
      name: /Current Admin/,
    });

    expect(
      within(row).getByRole('button', { name: 'Change role' }),
    ).toBeDisabled();
  });

  it('disables changes for read-only administrators', async () => {
    renderPage(false);

    const row = await screen.findByRole('row', {
      name: /Jane Doe/,
    });

    expect(
      within(row).getByRole('button', { name: 'Change role' }),
    ).toBeDisabled();
  });

  it('handles a forbidden role update safely', async () => {
    const user = userEvent.setup();
    vi.mocked(write).mockRejectedValue({
      response: { status: 403 },
    });

    renderPage();

    const row = await screen.findByRole('row', {
      name: /Jane Doe/,
    });

    await user.click(
      within(row).getByRole('button', { name: 'Change role' }),
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'New role' }),
      'ADMIN',
    );

    await user.click(
      screen.getByRole('button', { name: 'Confirm role change' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access denied',
    );
  });

  it('shows an authentication error when loading fails', async () => {
    vi.mocked(read).mockRejectedValue({
      response: { status: 401 },
    });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has expired',
    );
  });
});
