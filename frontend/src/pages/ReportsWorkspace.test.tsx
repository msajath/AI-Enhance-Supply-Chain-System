import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReportsWorkspace from './ReportsWorkspace';
import { apiClient } from '../services/api';

const project='e0000000-0000-0000-0000-000000000001';
const get=vi.spyOn(apiClient,'get'),post=vi.spyOn(apiClient,'post'),put=vi.spyOn(apiClient,'put');
const envelope=(data:unknown)=>({data:{success:true,data}});
beforeEach(()=>{
 get.mockReset();post.mockReset();put.mockReset();
 get.mockImplementation(async url=>envelope(String(url).endsWith('/projects')?{rows:[{id:project,name:'Authorized project',code:'P1'}]}:String(url).endsWith('/operations')?{fleet:[],inventory:[]}:String(url).endsWith('/audit')?{rows:[]}:{rows:[{id:'c1',project_name:'Authorized project',amount:'19.99',currency:'LKR',cost_type:'PURCHASE',reference:'C1'}],totals:[{currency:'LKR',amount:'19.99'}],budgets:[],notice:'Different currencies are never combined.'}));
 post.mockResolvedValue(envelope({row:{id:'new'}}));put.mockResolvedValue(envelope({row:{id:'budget'}}));
});
describe('scoped role reporting workspace',()=>{
 it('renders financial evidence and totals for read-only finance without mutation controls',async()=>{
  render(<ReportsWorkspace mode="costs" permissions={['finance.read','cost_report.read','cost_report.export']}/>);
  await screen.findByText('C1');
  expect(screen.getByText('Different currencies are never combined.')).toBeVisible();
  expect(screen.queryByRole('button',{name:'Record cost'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Save budget'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Export CSV'})).toBeVisible();
 });
 it('sends selected project and explicit dates when refetching a report',async()=>{
  render(<ReportsWorkspace mode="operations" permissions={['reports.read']}/>);
  await screen.findAllByRole('option',{name:'Authorized project (P1)'});
  fireEvent.change(screen.getByLabelText('Report project'),{target:{value:project}});
  await waitFor(()=>expect(get).toHaveBeenCalledWith('/api/v1/reports/operations',expect.objectContaining({params:expect.objectContaining({project_id:project,from:expect.any(String),to:expect.any(String)})})));
 });
 it('rejects reversed date ranges without issuing another request or leaving a spinner',async()=>{
  render(<ReportsWorkspace mode="costs" permissions={['cost_report.read']}/>);await screen.findByText('C1');
  get.mockClear();fireEvent.change(screen.getByLabelText('Report to'),{target:{value:'2000-01-01'}});
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a valid start and end date.');expect(get).not.toHaveBeenCalled();expect(screen.queryByText('Loading report...')).not.toBeInTheDocument();
 });
 it('submits explicit cost evidence through the real service contract only after validation',async()=>{
  render(<ReportsWorkspace mode="costs" permissions={['cost_report.read','cost_record.create']}/>);
  await screen.findAllByRole('option',{name:'Authorized project (P1)'});
  const button=screen.getByRole('button',{name:'Record cost'}),form=button.closest('form')!;
  const fields=within(form);fireEvent.change(fields.getByLabelText('Project'),{target:{value:project}});
  fireEvent.change(fields.getByLabelText('Amount'),{target:{value:'25.50'}});
  fireEvent.change(fields.getByLabelText('Unique cost reference'),{target:{value:'COST-NEW'}});
  fireEvent.change(fields.getByLabelText('Evidence reference'),{target:{value:'evidence-NEW'}});
  fireEvent.change(fields.getByLabelText('Description'),{target:{value:'Verified fictional cost'}});
  fireEvent.submit(form);
  await waitFor(()=>expect(post).toHaveBeenCalledWith('/api/v1/reports/costs',expect.objectContaining({project_id:project,amount:25.5,currency:'LKR',reference:'COST-NEW',evidence_reference:'evidence-NEW'})));
  expect(await screen.findByText('Cost evidence recorded.')).toBeVisible();
 });
 it('keeps financial write forms absent in auditor mode',async()=>{
  render(<ReportsWorkspace mode="audit" permissions={['audit.read','reports.read']}/>);
  expect(await screen.findByRole('heading',{name:'Authorized audit events'})).toBeVisible();
  expect(screen.queryByText('Record cost evidence')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Export CSV'})).not.toBeInTheDocument();
 });
 it('shows errors without reporting a successful write',async()=>{
  get.mockRejectedValue(new Error('Service unavailable'));
  render(<ReportsWorkspace mode="costs" permissions={['cost_report.read']}/>);
  await screen.findAllByRole('alert');expect(screen.queryByText('Cost evidence recorded.')).not.toBeInTheDocument();
 });
 it('clears the previous report shape when switching workspace modes',async()=>{
  const view=render(<ReportsWorkspace mode="costs" permissions={['cost_report.read','reports.read']}/>);await screen.findByText('C1');
  view.rerender(<ReportsWorkspace mode="operations" permissions={['cost_report.read','reports.read']}/>);
  expect(await screen.findByRole('heading',{name:'Fleet utilization'})).toBeVisible();expect(screen.queryByText('C1')).not.toBeInTheDocument();
 });
});
