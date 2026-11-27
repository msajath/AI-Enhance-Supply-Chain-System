import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResourcePage } from './Management';
import { nav, navigationPermission, resources } from './managementConfig';
import { emptyContext, read, write } from '../services/management';

vi.mock('../services/management', async importOriginal => ({...await importOriginal<typeof import('../services/management')>(),read:vi.fn(),write:vi.fn()}));

describe('role navigation with existing backend contracts',()=>{
 it.each(['management','procurement','logistics','project','site','auditor'])('%s exposes scoped read pages',prefix=>{
  expect(nav[prefix]).toContainEqual({path:`/${prefix}/projects`,label:'Projects'});
  expect(navigationPermission(`/${prefix}/sites`)).toBe('projects.read');
 });
 it('connects admin request review to real pending-state API actions',async()=>{
  vi.mocked(read).mockResolvedValue({rows:[{id:'request-1',full_name:'New User',email:'new@example.test',requested_role:'DRIVER',status:'PENDING'}]});
  vi.mocked(write).mockResolvedValue(null);
  render(<MemoryRouter><ResourcePage resource={resources['admin/requests']} context={emptyContext} onChanged={()=>{}} scope=""/></MemoryRouter>);
  await screen.findByText('New User');
  fireEvent.click(screen.getByRole('button',{name:'Approve'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirm approve'}));
  await waitFor(()=>expect(write).toHaveBeenCalledWith('admin/access-requests/request-1/approve',{}));
 });
});
