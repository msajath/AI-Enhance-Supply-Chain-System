import { randomUUID } from 'crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import session from 'express-session';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';

describe.skipIf(process.env.PROCUREMENT_INTEGRATION !== '1')(
  'Sprint 2 procurement against PostgreSQL',
  () => {
    const app = createApp(new session.MemoryStore());
    const org = randomUUID(),
      project = randomUUID(),
      site = randomUUID(),
      warehouse = randomUUID();
    const admin = randomUUID(),
      manager = randomUUID(),
      requester = randomUUID(),
      receiver = randomUUID();
    const outsider = randomUUID(),
      supplier = randomUUID();
    let material: string, second: string;
    const base = '/api/v1/procurement';
    function call(
      actor: string,
      method: 'post' | 'put' | 'patch' | 'get',
      path: string,
      body?: object
    ) {
      const token = jwt.sign({ sub: actor }, env.JWT_SECRET, {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        expiresIn: '5m',
      });
      const test = request(app)
        [method](path)
        .set('Authorization', 'Bearer ' + token);
      return body === undefined ? test : test.send(body);
    }
    beforeAll(async () => {
      if (env.DB_NAME !== 'qorvenz_procurement_test')
        throw Error('Use a disposable qorvenz_procurement_test database.');
      await pool.query(
        "INSERT INTO organizations (id,code,name) VALUES ($1,$2,'Procurement test')",
        [org, org]
      );
      for (const [id, role] of [
        [admin, 'ADMIN'],
        [manager, 'SUPPLY_CHAIN_MANAGER'],
        [requester, 'SITE_STOREKEEPER'],
        [receiver, 'WAREHOUSE_MANAGER'],
        [outsider, 'PROJECT_MANAGER'],
        [supplier, 'SUPPLIER_USER'],
      ]) {
        await pool.query(
          `INSERT INTO users (id,organization_id,email,full_name,role,password_hash)
        VALUES ($1,$2,$3,'Test user',$4,'unused')`,
          [id, org, id + '@example.test', role]
        );
      }
      await pool.query(
        "INSERT INTO projects (id,organization_id,code,name) VALUES ($1,$2,'P','Project')",
        [project, org]
      );
      await pool.query(
        "INSERT INTO sites (id,organization_id,project_id,code,name) VALUES ($1,$2,$3,'S','Site'),(gen_random_uuid(),$2,$3,'H','Hidden site')",
        [site, org, project]
      );
      await pool.query(
        "INSERT INTO warehouses (id,organization_id,code,name,location) VALUES ($1,$2,$3,'Warehouse','Test')",
        [warehouse, org, warehouse]
      );
      for (const id of [manager, requester]) {
        await pool.query(
          'INSERT INTO user_project_access (user_id,project_id,organization_id) VALUES ($1,$2,$3)',
          [id, project, org]
        );
        await pool.query(
          'INSERT INTO user_site_access (user_id,site_id,organization_id) VALUES ($1,$2,$3)',
          [id, site, org]
        );
      }
      await pool.query(
        'INSERT INTO user_warehouse_access (user_id,warehouse_id,organization_id) VALUES ($1,$2,$3)',
        [receiver, warehouse, org]
      );
    });
    afterAll(async () => {
      await pool.end();
    });

    it('returns field details and protects unauthenticated procurement endpoints', async () => {
      expect((await request(app).get(base + '/catalog')).status).toBe(401);
      const malformed = await request(app)
        .post(base + '/requisitions')
        .set('Content-Type', 'application/json')
        .send('{');
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.details[0].field).toBe('body');
      const invalid = await call(admin, 'post', base + '/catalog/categories', { name: '' });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.details[0].field).toBe('name');
    });
    it('filters sites, site counts and warehouses using each account’s grants', async () => {
      const sites = await call(requester, 'get', '/api/v1/sites');
      expect(sites.body.data.sites.map((s: { id: string }) => s.id)).toEqual([site]);
      expect(
        (await call(requester, 'get', '/api/v1/projects')).body.data.projects[0].siteCount
      ).toBe(1);
      expect((await call(outsider, 'get', '/api/v1/projects/' + project)).status).toBe(403);
      expect(
        (await call(receiver, 'get', '/api/v1/context')).body.data.warehouses.map(
          (w: { id: string }) => w.id
        )
      ).toEqual([warehouse]);
      expect((await call(requester, 'get', '/api/v1/context')).body.data.warehouses).toEqual([]);
    });
    it('enforces catalog references, unique codes, specifications and compatible positive factors', async () => {
      const catalog = base + '/catalog';
      expect(
        (await call(admin, 'post', catalog + '/categories', { name: 'Aggregate' })).status
      ).toBe(201);
      for (const [name, dimension] of [
        ['kg', 'mass'],
        ['g', 'mass'],
        ['L', 'volume'],
      ]) {
        expect((await call(admin, 'put', catalog + '/units', { name, dimension })).status).toBe(
          200
        );
      }
      const body = { code: 'SAND', name: 'Sand', category: 'Aggregate', unit: 'kg' };
      const created = await call(admin, 'post', catalog + '/materials', body);
      expect(created.status).toBe(201);
      material = created.body.data.id;
      second = (await call(admin, 'post', catalog + '/materials', { ...body, code: 'GRAVEL' })).body
        .data.id;
      expect((await call(admin, 'post', catalog + '/materials', body)).status).toBe(409);
      expect(
        (
          await call(admin, 'post', catalog + '/materials', {
            ...body,
            code: 'OTHER',
            unit: 'missing',
          })
        ).status
      ).toBe(409);
      const path = catalog + '/materials/' + material;
      expect(
        (
          await call(admin, 'patch', path + '/specifications', {
            specifications: { grade: 'coarse' },
          })
        ).body.data.specifications.grade
      ).toBe('coarse');
      const rule = { from_unit: 'g', to_unit: 'kg', factor: 0.001 };
      expect(
        (await call(admin, 'put', path + '/conversions', { ...rule, from_unit: 'L' })).status
      ).toBe(400);
      for (const factor of [0, -1])
        expect((await call(admin, 'put', path + '/conversions', { ...rule, factor })).status).toBe(
          400
        );
      expect((await call(admin, 'put', path + '/conversions', rule)).status).toBe(200);
      expect(
        Number(
          (await call(requester, 'post', path + '/convert', { from_unit: 'g', quantity: 2000 }))
            .body.data.quantity
        )
      ).toBe(2);
    });
    it('creates atomic multi-line drafts, enforces scope and records both decisions under the applicable limit', async () => {
      const path = base + '/requisitions';
      const body = {
        project_id: project,
        site_id: site,
        items: [material, second].map((material_id) => ({
          material_id,
          quantity: 2,
          estimated_unit_price: 10,
        })),
      };
      expect((await call(outsider, 'post', path, body)).status).toBe(403);
      expect(
        (
          await call(requester, 'post', path, {
            ...body,
            items: [{ ...body.items[0], quantity: 0 }],
          })
        ).status
      ).toBe(400);
      expect(
        (
          await call(requester, 'post', path, {
            ...body,
            items: [body.items[0], { ...body.items[1], material_id: randomUUID() }],
          })
        ).status
      ).toBe(409);
      expect((await call(requester, 'get', path)).body.data).toEqual([]);
      for (const decision of ['APPROVED', 'REJECTED']) {
        const draft = await call(requester, 'post', path, body);
        expect(draft.status).toBe(201);
        expect(draft.body.data).toMatchObject({
          requester_id: requester,
          project_id: project,
          status: 'DRAFT',
        });
        expect(draft.body.data.items).toHaveLength(2);
        const item = path + '/' + draft.body.data.id;
        expect((await call(requester, 'post', item + '/submit', {})).status).toBe(200);
        expect((await call(outsider, 'get', path)).body.data).toEqual([]);
        expect((await call(outsider, 'get', item + '/history')).status).toBe(404);
        const input = { decision, reason: 'Reviewed quantities' };
        expect((await call(requester, 'post', item + '/decisions', input)).status).toBe(403);
        expect(
          (await call(admin, 'post', base + '/approval-policies', { max_amount: 39 })).status
        ).toBe(201);
        expect((await call(manager, 'post', item + '/decisions', input)).status).toBe(403);
        // A promotion after submission must not allow someone to decide their own draft.
        await pool.query("UPDATE users SET role='SUPPLY_CHAIN_MANAGER' WHERE id=$1", [requester]);
        expect(
          (await call(admin, 'post', base + '/approval-policies', { max_amount: 40 })).status
        ).toBe(201);
        expect((await call(requester, 'post', item + '/decisions', input)).status).toBe(403);
        await pool.query("UPDATE users SET role='SITE_STOREKEEPER' WHERE id=$1", [requester]);
        expect((await call(manager, 'post', item + '/decisions', input)).status).toBe(201);
        expect((await call(manager, 'post', item + '/decisions', input)).status).toBe(409);
        const history = (await call(requester, 'get', item + '/history')).body.data;
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ decision, actor_id: manager, reason: input.reason });
        expect(history[0].decided_at).toBeTruthy();
        await expect(
          pool.query('DELETE FROM requisition_decisions WHERE requisition_id=$1', [
            draft.body.data.id,
          ])
        ).rejects.toThrow();
      }
    });
    it('computes supplier rates from posted receipts in visible warehouses and flags missing history', async () => {
      const path = base + '/suppliers/' + supplier + '/scorecard';
      expect((await call(receiver, 'get', path)).body.data).toMatchObject({
        incomplete_history: true,
        on_time_rate: null,
      });
      const postReceipt = async (
        quantity: number,
        rejected_quantity: number,
        promised_at: string
      ) => {
        const response = await call(receiver, 'post', '/api/v1/warehouse/receipts', {
          warehouse_id: warehouse,
          material_id: material,
          quantity,
          rejected_quantity,
          reference: randomUUID(),
          reason: 'Inbound delivery',
        });
        expect(response.status).toBe(201);
        const receipt_id = response.body.data.row.id;
        const commitment = { receipt_id, supplier_id: supplier, promised_at };
        expect(
          (await call(receiver, 'post', base + '/supplier-commitments', commitment)).status
        ).toBe(201);
        expect((await call(receiver, 'get', path)).body.data.incomplete_history).toBe(true);
        expect(
          (await call(receiver, 'post', '/api/v1/warehouse/receipts/' + receipt_id + '/post', {}))
            .status
        ).toBe(200);
        expect(
          (await call(receiver, 'post', base + '/supplier-commitments', commitment)).status
        ).toBe(404);
      };
      await postReceipt(10, 0, '2099-01-01T00:00:00Z');
      await postReceipt(8, 2, '2000-01-01T00:00:00Z');
      const score = (await call(receiver, 'get', path)).body.data;
      expect(score).toMatchObject({ completed_receipts: 2, incomplete_history: false });
      expect(Number(score.on_time_rate)).toBe(0.5);
      expect(Number(score.receipt_rejection_rate)).toBe(0.5);
      expect((await call(manager, 'get', path)).body.data.completed_receipts).toBe(0);
      const unlinked = await call(receiver, 'post', '/api/v1/warehouse/receipts', {
        warehouse_id: warehouse,
        material_id: material,
        quantity: 1,
        reference: randomUUID(),
        reason: 'Receipt without supplier attribution',
      });
      expect(
        (
          await call(
            receiver,
            'post',
            '/api/v1/warehouse/receipts/' + unlinked.body.data.row.id + '/post',
            {}
          )
        ).status
      ).toBe(200);
      expect((await call(receiver, 'get', path)).body.data).toMatchObject({
        unattributed_receipts: 1,
        incomplete_history: true,
      });
    });
  }
);
