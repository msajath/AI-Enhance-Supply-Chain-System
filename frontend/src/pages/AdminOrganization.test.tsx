
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminOrganizationPage } from './AdminOrganization';

const organization = {
  id: 'company-1',
  code: 'QOR-HQ-01',
  name: 'Qorvenz Tech',
  address: 'Colombo',
};

describe('AESCS-189 administration prototype', () => {
  it('displays the current company and demo-mode warning', () => {
    render(<AdminOrganizationPage organization={organization}/>);

    expect(screen.getByText('Qorvenz Tech')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Frontend demonstration mode'
    );
  });

  it('validates company details before saving', async () => {
    const user = userEvent.setup();
    render(<AdminOrganizationPage organization={organization}/>);

    await user.click(screen.getByRole('button', { name: 'Create company' }));
    await user.type(screen.getByRole('textbox', { name: 'Company code' }), '!');
    await user.type(screen.getByRole('textbox', { name: 'Company name' }), 'New Company');
    await user.click(screen.getByRole('button', { name: 'Save demo record' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Code must contain 2–20'
    );
  });

  it('creates a department in memory', async () => {
    const user = userEvent.setup();
    render(<AdminOrganizationPage organization={organization}/>);

    await user.click(screen.getByRole('button', { name: 'Departments' }));
    await user.click(screen.getByRole('button', { name: 'Create department' }));

    await user.type(
      screen.getByRole('textbox', { name: 'Department code' }),
      'LOG'
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Department name' }),
      'Logistics'
    );

    await user.click(screen.getByRole('button', { name: 'Save demo record' }));

    expect(screen.getByText('Logistics')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'No database changes were made'
    );
  });
});
