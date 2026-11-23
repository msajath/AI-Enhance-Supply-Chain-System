import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../config/database';
import { ApiResponse } from '../utils/apiResponse';
import {
  fail,
  permit,
  orgParams,
  safe,
  stamp,
  uuid,
  warehouseScope,
} from '../modules/management/shared';

export const scorecardRouter = Router();
const visible = warehouseScope('d');

scorecardRouter.post(
  '/supplier-commitments',
  permit('scorecard.record'),
  safe(async (req, res) => {
    const input = z
      .object({ receipt_id: uuid, supplier_id: uuid, promised_at: stamp })
      .strict()
      .parse(req.body);
    const a = req.auth!;
    const saved = await withTransaction(async (c) => {
      const receipt = await c.query(
        `SELECT d.id FROM stock_documents d WHERE ${visible}
      AND d.id=$4 AND d.kind='RECEIPT' AND d.status='PENDING' FOR UPDATE`,
        [...orgParams(a), input.receipt_id]
      );
      if (!receipt.rowCount) fail('A pending receipt in an assigned warehouse is required.', 404);
      const result = await c.query(
        `INSERT INTO supplier_receipt_commitments (receipt_id,organization_id,supplier_id,promised_at,recorded_by)
       SELECT $1,$2,u.id,$4,$5 FROM users u WHERE u.id=$3 AND u.organization_id=$2
       AND u.role='SUPPLIER_USER' AND u.is_active RETURNING *`,
        [input.receipt_id, a.organizationId, input.supplier_id, input.promised_at, a.userId]
      );
      if (!result.rowCount) fail('Active supplier not found.', 404);
      return result.rows[0];
    });
    res.status(201).json(ApiResponse.success(saved));
  })
);

scorecardRouter.get(
  '/suppliers/:id/scorecard',
  permit('scorecard.read'),
  safe(async (req, res) => {
    const a = req.auth!;
    const id = uuid.parse(req.params.id);
    const supplier = await pool.query(
      "SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='SUPPLIER_USER'",
      [id, a.organizationId]
    );
    if (!supplier.rowCount) fail('Supplier not found.', 404);
    const result = await pool.query(
      `WITH history AS (
       SELECT d.quantity,d.rejected_quantity,d.status,d.processed_at,c.promised_at
       FROM supplier_receipt_commitments c JOIN stock_documents d ON d.id=c.receipt_id
       WHERE ${visible} AND c.supplier_id=$4 AND d.status<>'CANCELLED'
     ), counts AS (
       SELECT count(*)::int AS linked_receipts,
         count(*) FILTER (WHERE status='POSTED' AND processed_at IS NOT NULL)::int AS completed_receipts,
         count(*) FILTER (WHERE status='POSTED' AND processed_at<=promised_at)::int AS on_time_receipts,
         count(*) FILTER (WHERE status='POSTED' AND processed_at IS NOT NULL AND rejected_quantity>0)::int AS receipts_with_rejections
       FROM history
     ), coverage AS (
       SELECT count(*)::int AS unattributed_receipts FROM stock_documents d
       WHERE ${visible} AND d.kind='RECEIPT' AND d.status='POSTED'
       AND NOT EXISTS (SELECT 1 FROM supplier_receipt_commitments c WHERE c.receipt_id=d.id)
     ) SELECT *, round(on_time_receipts::numeric / NULLIF(completed_receipts,0),4) AS on_time_rate,
         round(receipts_with_rejections::numeric / NULLIF(completed_receipts,0),4) AS receipt_rejection_rate,
         completed_receipts=0 OR completed_receipts<linked_receipts OR unattributed_receipts>0 AS incomplete_history FROM counts CROSS JOIN coverage`,
      [...orgParams(a), id]
    );
    res.json(ApiResponse.success(result.rows[0]));
  })
);
