import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeliveryWorkspace } from './DeliveryWorkspace';
import { read, write } from '../services/management';

vi.mock('../services/management',()=>({read:vi.fn(),write:vi.fn(),errorMessage:()=> 'Delivery service unavailable. Try again.'}));
const id='d0000000-0000-0000-0000-000000000001';
const row={id,status:'ARRIVED',project_id:'p1',destination_site_id:'s1',project_name:'Assigned project',site_name:'Assigned site',vehicle_number:'TEST-001',driver_name:'Test driver',items:[{id:'line1',material_id:'m1',material_name:'Fictional cement',unit:'bags',quantity:10}],events:[],proof:null,receipt:[]};
const options={projects:[{id:'p1',name:'Assigned project'}],sites:[{id:'s1',name:'Assigned site',project_id:'p1'}],warehouses:[{id:'w1',name:'Assigned warehouse'}],materials:[{id:'m1',name:'Fictional cement',unit:'bags'}],assignments:[],purchaseOrders:[]};
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(write).mockResolvedValue({});
 vi.mocked(read).mockImplementation(async(path:string)=>path==='delivery/options'?options:path.endsWith('/'+id)?{row}:{rows:[row]});
});
describe('role-aware delivery workspace',()=>{
 it('shows own-driver progress and metadata evidence controls without planning controls',async()=>{
  render(<DeliveryWorkspace permissions={['delivery.assigned.read','delivery.assigned.update','proof_of_delivery.submit']}/>);
  await screen.findByText('Assigned project');
  expect(screen.queryByRole('button',{name:'New transport request'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'View d0000000'}));
  await screen.findByRole('heading',{name:'Receiver acknowledgement'});
  expect(screen.getByText(/Photo and signature uploads are not available/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Receiver name'),{target:{value:'Synthetic recipient'}});
  fireEvent.change(screen.getByLabelText('Received at'),{target:{value:'2026-01-02T12:00'}});
  fireEvent.click(screen.getByRole('button',{name:'Record acknowledgement'}));
  await waitFor(()=>expect(write).toHaveBeenCalledWith(`delivery/deliveries/${id}/proof`,expect.objectContaining({receiver_name:'Synthetic recipient',received_at:expect.any(String)})));
 });
 it('offers site reconciliation but not driver or dispatcher status controls to the storekeeper',async()=>{
  render(<DeliveryWorkspace permissions={['site_receipt.confirm']}/>);
  await screen.findByText('Assigned project');fireEvent.click(screen.getByRole('button',{name:'View d0000000'}));
  await screen.findByRole('heading',{name:'Reconcile site receipt'});
  expect(screen.queryByRole('button',{name:'Dispatch'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Record acknowledgement'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('accepted 1'),{target:{value:'8'}});
  fireEvent.change(screen.getByLabelText('rejected 1'),{target:{value:'1'}});
  fireEvent.change(screen.getByLabelText('short 1'),{target:{value:'1'}});
  fireEvent.change(screen.getByLabelText('Discrepancy reason 1'),{target:{value:'One damaged, one missing'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm site receipt'}));
  await waitFor(()=>expect(write).toHaveBeenCalledWith(`delivery/deliveries/${id}/receipt`,{notes:'',items:[{delivery_item_id:'line1',accepted_quantity:8,rejected_quantity:1,short_quantity:1,reason:'One damaged, one missing'}]}));
 });
 it('submits material lines and real selected scopes through the transport API',async()=>{
  render(<DeliveryWorkspace permissions={['transport_request.read','transport_request.create','delivery.read','delivery.assign','delivery.update']}/>);
  await screen.findByText('Assigned project');fireEvent.click(screen.getByRole('button',{name:'New transport request'}));
  fireEvent.change(screen.getByLabelText('Project'),{target:{value:'p1'}});
  fireEvent.change(screen.getByLabelText('Destination site'),{target:{value:'s1'}});
  fireEvent.change(screen.getByLabelText('Source warehouse'),{target:{value:'w1'}});
  fireEvent.change(screen.getByLabelText('Needed at'),{target:{value:'2027-01-01T12:00'}});
  fireEvent.change(screen.getByLabelText('Material 1'),{target:{value:'m1'}});
  fireEvent.click(screen.getByRole('button',{name:'Save transport request'}));
  await waitFor(()=>expect(write).toHaveBeenCalledWith('delivery/transport-requests',expect.objectContaining({project_id:'p1',destination_site_id:'s1',warehouse_id:'w1',items:[{material_id:'m1',quantity:1}]})));
 });
 it('does not show success when the backend rejects a receipt',async()=>{
  vi.mocked(write).mockRejectedValue(new Error('Not authorized'));
  render(<DeliveryWorkspace permissions={['site_receipt.confirm']}/>);
  await screen.findByText('Assigned project');fireEvent.click(screen.getByRole('button',{name:'View d0000000'}));
  await screen.findByRole('heading',{name:'Reconcile site receipt'});fireEvent.click(screen.getByRole('button',{name:'Confirm site receipt'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Delivery service unavailable');
  expect(screen.queryByText('Site receipt recorded and quantities reconciled.')).not.toBeInTheDocument();
 });
});
