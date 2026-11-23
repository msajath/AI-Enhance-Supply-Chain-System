import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import { ApiResponse } from '../utils/apiResponse';
import { amount, fail, permit, safe, text, uuid } from '../modules/management/shared';

export const catalogRouter = Router();
const manage = permit('catalog.manage');
const specs = z.record(text, z.string().trim().min(1).max(500));
const material = z
  .object({
    code: text,
    name: text,
    unit: text,
    category: text,
    specifications: specs.default({}),
    reorder_level: amount.default(0),
  })
  .strict();

catalogRouter.get(
  '/',
  permit('catalog.read'),
  safe(async (req, res) => {
    const org = [req.auth!.organizationId];
    const [materials, units, categories, conversions] = await Promise.all([
      pool.query('SELECT * FROM materials WHERE organization_id=$1 ORDER BY code', org),
      pool.query(
        'SELECT name, dimension FROM catalog_units WHERE organization_id=$1 ORDER BY name',
        org
      ),
      pool.query(
        'SELECT name FROM material_categories WHERE organization_id=$1 ORDER BY name',
        org
      ),
      pool.query(
        'SELECT material_id, from_unit, to_unit, factor FROM material_conversions WHERE organization_id=$1 ORDER BY material_id, from_unit',
        org
      ),
    ]);
    res.json(
      ApiResponse.success({
        materials: materials.rows,
        units: units.rows,
        categories: categories.rows,
        conversions: conversions.rows,
      })
    );
  })
);

catalogRouter.post(
  '/categories',
  manage,
  safe(async (req, res) => {
    const { name } = z.object({ name: text }).strict().parse(req.body);
    const result = await pool.query(
      'INSERT INTO material_categories VALUES ($1,$2) RETURNING name',
      [req.auth!.organizationId, name]
    );
    res.status(201).json(ApiResponse.success(result.rows[0]));
  })
);

catalogRouter.put(
  '/units',
  manage,
  safe(async (req, res) => {
    const unit = z
      .object({ name: text, dimension: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/) })
      .strict()
      .parse(req.body);
    const result = await pool.query(
      `INSERT INTO catalog_units VALUES ($1,$2,$3)
     ON CONFLICT (organization_id,name) DO UPDATE SET dimension=excluded.dimension
     WHERE catalog_units.dimension LIKE 'legacy:%' OR catalog_units.dimension=excluded.dimension
     RETURNING name, dimension`,
      [req.auth!.organizationId, unit.name, unit.dimension]
    );
    if (!result.rowCount) fail('The unit already belongs to another dimension.');
    res.json(ApiResponse.success(result.rows[0]));
  })
);

catalogRouter.post(
  '/materials',
  manage,
  safe(async (req, res) => {
    const m = material.parse(req.body);
    const result = await pool.query(
      `INSERT INTO materials (organization_id,code,name,unit,category,reorder_level,specifications)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.auth!.organizationId,
        m.code,
        m.name,
        m.unit,
        m.category,
        m.reorder_level,
        m.specifications,
      ]
    );
    res.status(201).json(ApiResponse.success(result.rows[0]));
  })
);

catalogRouter.patch(
  '/materials/:id/specifications',
  manage,
  safe(async (req, res) => {
    const { specifications } = z.object({ specifications: specs }).strict().parse(req.body);
    const result = await pool.query(
      'UPDATE materials SET specifications=$3 WHERE organization_id=$1 AND id=$2 RETURNING *',
      [req.auth!.organizationId, uuid.parse(req.params.id), specifications]
    );
    if (!result.rowCount) fail('Material not found.', 404);
    res.json(ApiResponse.success(result.rows[0]));
  })
);

// One explicit factor per material and input unit, always relative to the material's stock unit.
catalogRouter.put(
  '/materials/:id/conversions',
  manage,
  safe(async (req, res) => {
    const rule = z
      .object({ from_unit: text, to_unit: text, factor: z.number().finite().positive() })
      .strict()
      .parse(req.body);
    const result = await pool.query(
      `INSERT INTO material_conversions (organization_id,material_id,from_unit,to_unit,dimension,factor)
     SELECT m.organization_id,m.id,u.name,m.unit,u.dimension,$5
     FROM materials m JOIN catalog_units u ON u.organization_id=m.organization_id AND u.name=$3
     JOIN catalog_units target ON target.organization_id=m.organization_id AND target.name=m.unit
     WHERE m.organization_id=$1 AND m.id=$2 AND m.unit=$4 AND u.dimension=target.dimension AND u.name<>target.name
     ON CONFLICT (material_id,from_unit,to_unit) DO UPDATE SET factor=excluded.factor RETURNING *`,
      [
        req.auth!.organizationId,
        uuid.parse(req.params.id),
        rule.from_unit,
        rule.to_unit,
        rule.factor,
      ]
    );
    if (!result.rowCount)
      fail('Choose compatible units and the material stock unit as the target.', 400, 'to_unit');
    res.json(ApiResponse.success(result.rows[0]));
  })
);

catalogRouter.post(
  '/materials/:id/convert',
  permit('catalog.read'),
  safe(async (req, res) => {
    const input = z
      .object({ from_unit: text, quantity: z.number().finite().positive() })
      .strict()
      .parse(req.body);
    const result = await pool.query(
      `SELECT to_unit, factor * $4::numeric AS quantity FROM material_conversions
     WHERE organization_id=$1 AND material_id=$2 AND from_unit=$3`,
      [req.auth!.organizationId, uuid.parse(req.params.id), input.from_unit, input.quantity]
    );
    if (!result.rowCount) fail('No conversion rule for this material and unit.', 400, 'from_unit');
    res.json(ApiResponse.success(result.rows[0]));
  })
);
