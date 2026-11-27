import { z } from 'zod';
import { amount, optionalId, stamp, uuid } from '../management/shared';

const line = z.object({ material_id: uuid, quantity: amount.positive() }).strict();
const lines = z.array(line).min(1).max(100).refine(items => new Set(items.map(i=>i.material_id)).size===items.length,'Materials must not be repeated');
export const transportSchema = z.object({project_id:uuid,warehouse_id:uuid,destination_site_id:uuid,
  purchase_order_id:optionalId,stock_document_id:optionalId,needed_at:stamp,notes:z.string().trim().max(2000).default(''),items:lines,
}).strict().refine(v=>!v.purchase_order_id||!v.stock_document_id,'Select one transport source');
export const deliverySchema = z.object({transport_request_id:uuid,assignment_id:uuid,eta:stamp,items:lines}).strict();
export const transitionSchema = z.object({status:z.enum(['DISPATCHED','IN_TRANSIT','ARRIVED','FAILED','CANCELLED']),notes:z.string().trim().max(2000).default('')}).strict();
export const proofSchema = z.object({receiver_name:z.string().trim().min(1).max(255),received_at:stamp,notes:z.string().trim().max(2000).default('')}).strict();
export const receiptSchema = z.object({notes:z.string().trim().max(2000).default(''),items:z.array(z.object({delivery_item_id:uuid,
  accepted_quantity:amount,rejected_quantity:amount,short_quantity:amount,reason:z.string().trim().max(2000).default(''),
}).strict()).min(1).max(100)}).strict().refine(v=>new Set(v.items.map(i=>i.delivery_item_id)).size===v.items.length,'Receipt items must not repeat');

export function canTransition(previous:string,next:string,ownDriver:boolean):boolean {
  if(ownDriver) return previous==='DISPATCHED'&&next==='IN_TRANSIT'||previous==='IN_TRANSIT'&&['ARRIVED','FAILED'].includes(next);
  return previous==='PLANNED'&&['DISPATCHED','CANCELLED'].includes(next)||previous==='DISPATCHED'&&['IN_TRANSIT','FAILED'].includes(next)||previous==='IN_TRANSIT'&&['ARRIVED','FAILED'].includes(next);
}
export function reconciles(dispatched:number,accepted:number,rejected:number,short:number):boolean {
  return Math.round(dispatched*1000)===Math.round(accepted*1000)+Math.round(rejected*1000)+Math.round(short*1000);
}
