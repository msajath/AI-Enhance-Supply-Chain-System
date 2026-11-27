import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProcurementWorkspace from './ProcurementWorkspace';
import { read, write, emptyContext } from '../services/management';
vi.mock('../services/management',async original=>({...await original<typeof import('../services/management')>(),read:vi.fn(),write:vi.fn(),errorMessage:(e:unknown)=>(e as Error).message}));
const context={...emptyContext,projects:[{id:'project-1',name:'River Bridge'}]};
const fixtures:Record<string,unknown[]>={
 'procurement/requisitions':[{id:'pr-1',code:'PR-42',project_name:'River Bridge',status:'APPROVED'}],
 'procurement/suppliers':[{id:'supplier-1',name:'Cement Partners',status:'ACTIVE'}],
 'procurement/quotations':[{id:'quote-1',supplier_name:'Cement Partners',requisition_code:'PR-42',lead_time_days:3,valid_until:'2028-01-01',items:[{id:'line-1',quantity:5,unit_price:4}]}],
 'procurement/supplier/rfqs':[{id:'rfq-1',requisition_code:'PR-42',due_date:'2028-01-01',items:[{id:'item-1',material_name:'Portland Cement',quantity:'5',unit:'bags'}]}],
 'procurement/reviewers':[{id:'reviewer-1',full_name:'Sana Reviewer',role:'SUPPLY_CHAIN_MANAGER'}],
 'admin/users':[{id:'user-1',full_name:'Supplier Sam',role:'SUPPLIER_USER',is_active:true}],
};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(read).mockImplementation(async path=>({rows:fixtures[path]??[]}) as never);vi.mocked(write).mockResolvedValue({});});
describe('procurement workspace real handlers with mocked transport',()=>{
 it('submits an RFQ with selected named requisition and supplier',async()=>{
  const user=userEvent.setup();render(<ProcurementWorkspace mode="purchasing" permissions={['requisition.read','supplier.read','rfq.create']} context={context}/>);
  await user.selectOptions(await screen.findByLabelText('Approved requisition'),'pr-1');await user.type(screen.getByLabelText('Response deadline'),'2028-01-01');await user.click(screen.getByLabelText('Cement Partners'));await user.click(screen.getByRole('button',{name:'Send quotation request'}));
  await waitFor(()=>expect(write).toHaveBeenCalledWith('procurement/rfqs',{requisition_id:'pr-1',due_date:'2028-01-01',supplier_ids:['supplier-1']},'post'));expect(await screen.findByText('Saved successfully.')).toBeInTheDocument();
 });
 it('compares submitted totals and hides order creation when permission is absent',async()=>{
  render(<ProcurementWorkspace mode="purchasing" permissions={['quotation.read']} context={context}/>);expect(await screen.findByText('20.00')).toBeInTheDocument();expect(screen.getByText('Cement Partners')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Submit order for approval'})).not.toBeInTheDocument();
 });
 it('supplier submits exact invited item quantity and entered price',async()=>{
  const user=userEvent.setup();render(<ProcurementWorkspace mode="supplier" permissions={['rfq.supplier.read','quotation.supplier.submit','purchase_order.supplier.read']} context={context}/>);
  await user.selectOptions(await screen.findByLabelText('Invited request'),'rfq-1');await user.type(screen.getByLabelText('Unit price for Portland Cement (5 bags)'),'4.25');await user.type(screen.getByLabelText('Valid until'),'2028-01-10');await user.type(screen.getByLabelText('Lead time in days'),'3');await user.type(screen.getByLabelText('Delivery terms'),'Deliver to the project store');await user.click(screen.getByRole('button',{name:'Submit supplier quotation'}));
  await waitFor(()=>expect(write).toHaveBeenCalledWith('procurement/supplier/quotations',{rfq_id:'rfq-1',valid_until:'2028-01-10',lead_time_days:3,delivery_terms:'Deliver to the project store',items:[{requisition_item_id:'item-1',quantity:5,unit_price:4.25}]},'post'));
 });
 it('displays server rejection without claiming a successful order',async()=>{
  vi.mocked(write).mockRejectedValue(new Error('Quotation has expired.'));const user=userEvent.setup();render(<ProcurementWorkspace mode="purchasing" permissions={['quotation.read','purchase_order.create']} context={context}/>);
  await user.selectOptions(await screen.findByLabelText('Supplier quotation'),'quote-1');await user.type(screen.getByLabelText('Order reference'),'PO-42');await user.click(screen.getByRole('button',{name:'Submit order for approval'}));expect(await screen.findByRole('alert')).toHaveTextContent('Quotation has expired.');expect(screen.queryByText('Saved successfully.')).not.toBeInTheDocument();
 });
 it('configures an explicit reviewer and allows admin supplier account linking',async()=>{
  const user=userEvent.setup();render(<ProcurementWorkspace mode="policies" permissions={['procurement.policy.manage','users.update']} context={context}/>);
  await user.selectOptions(await screen.findByLabelText('Project'),'project-1');await user.selectOptions(screen.getByLabelText('Independent reviewer'),'reviewer-1');await user.click(screen.getByRole('button',{name:'Save reviewer policy'}));
  await waitFor(()=>expect(write).toHaveBeenCalledWith('procurement/approval-policies',{project_id:'project-1',approver_id:'reviewer-1',kind:'REQUISITION',is_active:true},'put'));
  await user.selectOptions(await screen.findByLabelText('Supplier'),'supplier-1');await user.selectOptions(screen.getByLabelText('Supplier user account'),'user-1');await user.click(screen.getByRole('button',{name:'Link account to supplier'}));await waitFor(()=>expect(write).toHaveBeenCalledWith('procurement/suppliers/supplier-1/users/user-1',{},'put'));
 });
});
