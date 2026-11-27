import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../config/database';
import { ApiResponse } from '../utils/apiResponse';
import { assignedPolicy } from '../modules/procurement/shared';
import {
  amount,
  fail,
  orgParams,
  permit,
  projectScope,
  safe,
  site,
  text,
  uuid,
  audit,insert,
} from '../modules/management/shared';

export const requisitionRouter = Router();
const money = z.number().finite().positive().max(999999999).multipleOf(0.01);
const line = z
  .object({ material_id: uuid, quantity: amount.positive(), estimated_unit_price: money })
  .strict();
const draft = z
  .object({ project_id: uuid, site_id: uuid, items: z.array(line).min(1).max(200) })
  .strict();
const visible = projectScope('r');

requisitionRouter.post(
  '/approval-policies',
  permit('approval.configure'),
  safe(async (req, res) => {
    const { max_amount } = z.object({ max_amount: money }).strict().parse(req.body);
    const a = req.auth!;
    const result = await pool.query(
      'INSERT INTO requisition_approval_policies (organization_id,max_amount,configured_by) VALUES ($1,$2,$3) RETURNING *',
      [a.organizationId, max_amount, a.userId]
    );
    res.status(201).json(ApiResponse.success(result.rows[0]));
  })
);

requisitionRouter.get(
  '/approval-policies',
  permit('approval.configure'),
  safe(async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM requisition_approval_policies WHERE organization_id=$1 ORDER BY id DESC',
      [req.auth!.organizationId]
    );
    res.json(ApiResponse.success(result.rows));
  })
);

requisitionRouter.post(
  '/requisitions',
  permit('requisition.create'),
  safe(async (req, res) => {
    const data = draft.parse(req.body);
    const a = req.auth!;
    const result = await withTransaction(async (c) => {
      await site(c, a, data.site_id, data.project_id);
      const header = await c.query(
        'INSERT INTO requisitions (organization_id,project_id,site_id,requester_id) VALUES ($1,$2,$3,$4) RETURNING *',
        [a.organizationId, data.project_id, data.site_id, a.userId]
      );
      const items = await c.query(
        `INSERT INTO requisition_items (requisition_id,organization_id,material_id,quantity,estimated_unit_price)
       SELECT $1,$2,i.* FROM jsonb_to_recordset($3::jsonb) AS i(material_id uuid,quantity numeric,estimated_unit_price numeric)
       RETURNING material_id,quantity,estimated_unit_price`,
        [header.rows[0].id, a.organizationId, JSON.stringify(data.items)]
      );
      await audit(c,a,'REQUISITION_DRAFT_CREATED',{id:header.rows[0].id,project_id:data.project_id});
      return { ...header.rows[0], items: items.rows };
    });
    res.status(201).json(ApiResponse.success(result));
  })
);

requisitionRouter.get(
  '/requisitions',
  permit('requisition.read'),
  safe(async (req, res) => {
    const result = await pool.query(
      `SELECT r.*, (SELECT jsonb_agg(jsonb_build_object('material_id',i.material_id,'quantity',i.quantity,
      'estimated_unit_price',i.estimated_unit_price) ORDER BY i.material_id)
      FROM requisition_items i WHERE i.requisition_id=r.id) AS items
     FROM requisitions r WHERE ${visible} ORDER BY r.created_at DESC,r.id`,
      orgParams(req.auth!)
    );
    res.json(ApiResponse.success(result.rows));
  })
);

requisitionRouter.post(
  '/requisitions/:id/submit',
  permit('requisition.submit'),
  safe(async (req, res) => {
    const a = req.auth!;
    const result = await withTransaction(async c=>{
    const updated = await c.query(
      `UPDATE requisitions r SET status='SUBMITTED' WHERE ${visible}
     AND r.id=$4 AND r.requester_id=$3 AND r.status='DRAFT' RETURNING r.*`,
      [...orgParams(a), uuid.parse(req.params.id)]
    );
    if (!updated.rowCount) fail('No accessible draft owned by you is available to submit.', 409);
    const extension=(await c.query("SELECT to_regclass('public.approval_requests') table_name")).rows[0]?.table_name;
    if(extension){
      const policy=await assignedPolicy(c,a,updated.rows[0].project_id,'REQUISITION');
      if(!(await c.query('SELECT sum(quantity*estimated_unit_price)<=$2::numeric within_limit FROM requisition_items WHERE requisition_id=$1',[updated.rows[0].id,policy.max_amount])).rows[0]?.within_limit)fail('The estimate exceeds the assigned reviewer limit.',403);
      await insert(c,'approval_requests',{organization_id:a.organizationId,policy_id:policy.id,requisition_id:updated.rows[0].id,approver_id:policy.approver_id,requester_id:a.userId,max_amount:policy.max_amount,legacy_policy_id:policy.legacy_policy_id});
    }
    await audit(c,a,'REQUISITION_SUBMITTED',{id:updated.rows[0].id,project_id:updated.rows[0].project_id});
    return updated;
    });
    res.json(ApiResponse.success(result.rows[0]));
  })
);

requisitionRouter.post(
  '/requisitions/:id/decisions',
  permit('requisition.approve'),
  safe(async (req, res) => {
    const input = z
      .object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: text })
      .strict()
      .parse(req.body);
    const a = req.auth!;
    const id = uuid.parse(req.params.id);
    const decision = await withTransaction(async (c) => {
      const locked = await c.query(
        `SELECT r.* FROM requisitions r WHERE ${visible} AND r.id=$4 FOR UPDATE`,
        [...orgParams(a), id]
      );
      const record = locked.rows[0];
      if (!record) fail('Requisition not found.', 404);
      if (record.status !== 'SUBMITTED') fail('A decision requires a submitted requisition.');
      if (record.requester_id === a.userId)
        fail('A requester cannot decide their own requisition.', 403);
      const extension=(await c.query("SELECT to_regclass('public.approval_requests') table_name")).rows[0]?.table_name;
      const assigned=extension?(await c.query('SELECT * FROM approval_requests WHERE requisition_id=$1 AND organization_id=$2 FOR UPDATE',[id,a.organizationId])).rows[0]:undefined;
      if(assigned&&(assigned.approver_id!==a.userId||assigned.status!=='PENDING'))fail('Only the assigned pending reviewer may decide.',403);
      const policy = await c.query(
        `SELECT id,max_amount >= (SELECT SUM(quantity*estimated_unit_price) FROM requisition_items WHERE requisition_id=$2) AS within_limit
       FROM requisition_approval_policies WHERE organization_id=$1 AND ($3::bigint IS NULL OR id=$3) ORDER BY id DESC LIMIT 1`,
        [a.organizationId, id,assigned?.legacy_policy_id??null]
      );
      if (!policy.rowCount) fail('Configure an approval policy first.');
      if (!policy.rows[0].within_limit)
        fail('This requisition exceeds the configured decision limit.', 403);
      const saved = await c.query(
        `INSERT INTO requisition_decisions (organization_id,requisition_id,policy_id,actor_id,decision,reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [a.organizationId, id, policy.rows[0].id, a.userId, input.decision, input.reason]
      );
      await c.query('UPDATE requisitions SET status=$2 WHERE id=$1', [id, input.decision]);
      if(assigned){
       await c.query('UPDATE approval_requests SET status=$2 WHERE id=$1',[assigned.id,input.decision]);
       await insert(c,'approval_actions',{organization_id:a.organizationId,approval_request_id:assigned.id,actor_id:a.userId,decision:input.decision,comments:input.reason});
      }
      await audit(c,a,'REQUISITION_'+input.decision,{id,project_id:record.project_id});
      return saved.rows[0];
    });
    res.status(201).json(ApiResponse.success(decision));
  })
);

requisitionRouter.get(
  '/requisitions/:id/history',
  permit('requisition.read'),
  safe(async (req, res) => {
    const result = await pool.query(
      `SELECT r.id, d.decision, d.actor_id, d.decided_at, d.reason, d.policy_id, p.max_amount
     FROM requisitions r LEFT JOIN requisition_decisions d ON d.requisition_id=r.id
     LEFT JOIN requisition_approval_policies p ON p.id=d.policy_id WHERE ${visible} AND r.id=$4`,
      [...orgParams(req.auth!), uuid.parse(req.params.id)]
    );
    if (!result.rowCount) fail('Requisition not found.', 404);
    res.json(ApiResponse.success(result.rows.filter((row) => row.decision)));
  })
);
