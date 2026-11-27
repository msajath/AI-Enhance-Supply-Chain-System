import { z } from 'zod';
import { date, uuid } from '../management/shared';

const periodFields={from:date,to:date,project_id:uuid.optional()};
export const periodSchema=z.object(periodFields).strict()
 .refine(v=>v.to>=v.from,{message:'End date cannot precede start date.',path:['to']})
 .refine(v=>Date.parse(v.to)-Date.parse(v.from)<=366*86400000,{message:'Select at most 366 days.',path:['to']});
export const auditPeriodSchema=z.object({...periodFields,event_type:z.string().trim().min(1).max(100).optional(),module:z.string().trim().min(1).max(50).optional()}).strict()
 .refine(v=>v.to>=v.from,{message:'End date cannot precede start date.',path:['to']})
 .refine(v=>Date.parse(v.to)-Date.parse(v.from)<=366*86400000,{message:'Select at most 366 days.',path:['to']});
export const money=z.number().finite().min(0).max(999999999999.99).multipleOf(0.01);
export const currency=z.string().regex(/^[A-Z]{3}$/,'Use a three-letter uppercase currency code.');
export const costSchema=z.object({project_id:uuid,cost_type:z.enum(['PURCHASE','TRANSPORT','FUEL','MAINTENANCE','WAREHOUSE','WASTAGE','OTHER']),amount:money.positive(),currency,incurred_on:date,
 reference:z.string().trim().min(1).max(255),evidence_reference:z.string().trim().min(1).max(1000),description:z.string().trim().min(1).max(2000)}).strict();
export const budgetSchema=z.object({project_id:uuid,currency,amount:money,period_start:date,period_end:date}).strict()
 .refine(v=>v.period_end>=v.period_start,{message:'Budget end date cannot precede start date.',path:['period_end']})
 .refine(v=>Date.parse(v.period_end)-Date.parse(v.period_start)<=366*86400000,{message:'A budget period must not exceed 366 days.',path:['period_end']});

/** CSV cells are quoted and formula-prefixed strings are escaped for spreadsheet safety. */
export function toCsv(columns:string[],rows:Record<string,unknown>[]):string {
 const field=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 return [columns.map(field).join(','),...rows.map(row=>columns.map(key=>field(row[key])).join(','))].join('\r\n')+'\r\n';
}

// Tenant and explicit project grants apply to every financial/report query.
// Column aliases are fixed strings supplied by the implementation, never input.
export const reportScope=(alias:string)=>`${alias}.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM user_project_access g WHERE g.user_id=$3 AND g.project_id=${alias}.project_id))`;
