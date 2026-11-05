import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { hash } from 'bcryptjs';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';

// Real PostgreSQL: request an account → admin approves / rejects → the new user can sign in.
// Run with ACCESS_INTEGRATION=1 DB_NAME=qorvenz_management_test after running all migrations.
const enabled = process.env.ACCESS_INTEGRATION === '1';
describe.skipIf(!enabled)('access requests against real PostgreSQL', () => {
  const suffix = randomUUID().slice(0, 8), org = randomUUID(), otherOrg = randomUUID(), code = 'AR-' + suffix;
  const adminEmail = `admin-${suffix}@example.com`, password = 'Integration-only-password!';
  const app = createApp();
  const admin = request.agent(app);
  const requestAccount = (email: string, extra: object = {}) => request(app).post('/api/v1/auth/access-requests')
    .send({ fullName: 'Requested Person', email, organizationCode: code.toLowerCase(), requestedRole: 'FLEET_MANAGER', password, ...extra });
  const pending = async (email: string) => (await admin.get('/api/v1/admin/access-requests')).body.data.rows.find((r: { email: string }) => r.email === email);

  beforeAll(async () => {
    if (env.DB_NAME !== 'qorvenz_management_test') throw new Error('Use the dedicated qorvenz_management_test database.');
    await pool.query('INSERT INTO organizations(id,name,code) VALUES($1,$2,$3),($4,$5,$6)', [org, 'Requests Co', code, otherOrg, 'Other Co', 'AR-OTHER-' + suffix]);
    await pool.query('INSERT INTO users(organization_id,email,full_name,role,password_hash) VALUES($1,$2,$3,$4,$5)', [org, adminEmail, 'Requests Admin', 'ADMIN', await hash(password, 12)]);
    expect((await admin.post('/api/v1/auth/login').send({ email: adminEmail, password })).status).toBe(200);
  }, 20000);
  afterAll(async () => { await pool.end(); });

  it('saves a request that grants nothing until it is approved', async () => {
    const email = `new-${suffix}@example.com`;
    expect((await requestAccount(email)).status).toBe(202);
    expect((await requestAccount(email)).status).toBe(202); // duplicate: still one pending row
    const rows = await pool.query('SELECT status FROM access_requests WHERE email=$1', [email]);
    expect(rows.rows).toEqual([{ status: 'PENDING' }]);
    expect((await request(app).post('/api/v1/auth/login').send({ email, password })).status).toBe(401);
  });

  it('lets the admin approve it, creating an active account with the requested role and the chosen password', async () => {
    const email = `new-${suffix}@example.com`;
    const row = await pending(email);
    expect(row).toMatchObject({ status: 'PENDING', requested_role: 'FLEET_MANAGER' });
    expect(row.password_hash).toBeUndefined();
    const approved = await admin.post(`/api/v1/admin/access-requests/${row.id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.row).toMatchObject({ email, role: 'FLEET_MANAGER', is_active: true });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('Fleet manager');
    expect((await admin.post(`/api/v1/admin/access-requests/${row.id}/approve`).send({})).status).toBe(409);
    expect((await pool.query("SELECT count(*)::int n FROM system_audit_logs WHERE event_type='ACCESS_REQUEST_APPROVED' AND metadata->>'request_id'=$1", [row.id])).rows[0].n).toBe(1);
  });

  it('lets the admin reject a request; the person still cannot sign in', async () => {
    const email = `reject-${suffix}@example.com`;
    await requestAccount(email, { requestedRole: 'WAREHOUSE_MANAGER' });
    const row = await pending(email);
    expect((await admin.post(`/api/v1/admin/access-requests/${row.id}/reject`).send({})).status).toBe(200);
    expect((await pending(email)).status).toBe('REJECTED');
    expect((await request(app).post('/api/v1/auth/login').send({ email, password })).status).toBe(401);
  });

  it('never shows or approves another company\'s requests', async () => {
    const email = `other-${suffix}@example.com`;
    await requestAccount(email, { organizationCode: 'AR-OTHER-' + suffix });
    expect(await pending(email)).toBeUndefined();
    const other = (await pool.query('SELECT id FROM access_requests WHERE email=$1', [email])).rows[0];
    expect((await admin.post(`/api/v1/admin/access-requests/${other.id}/approve`).send({})).status).toBe(404);
  });

  it('refuses the request pages for non-admins', async () => {
    const email = `new-${suffix}@example.com`;
    const fleet = request.agent(app);
    await fleet.post('/api/v1/auth/login').send({ email, password });
    expect((await fleet.get('/api/v1/admin/access-requests')).status).toBe(403);
  });

  it('approves a Driver, who sees only the trips of the driver record linked to their login', async () => {
    const email = `driver-${suffix}@example.com`;
    await requestAccount(email, { requestedRole: 'DRIVER' });
    const req = await pending(email);
    expect(req.requested_role).toBe('DRIVER');
    const userId = (await admin.post(`/api/v1/admin/access-requests/${req.id}/approve`).send({})).body.data.row.id;
    const driver = request.agent(app);
    const login = await driver.post('/api/v1/auth/login').send({ email, password });
    expect(login.body.data.user.role).toBe('Driver');
    // Not linked yet: no trips, a notice, and no access to manager or admin APIs.
    let dash = (await driver.get('/api/v1/driver/dashboard')).body.data;
    expect(dash.alerts[0].notice).toMatch(/not linked/);
    for (const path of ['fleet/vehicles', 'warehouse/inventory', 'admin/users', 'projects']) expect((await driver.get('/api/v1/' + path)).status).toBe(403);
    // A fleet record linked to this login, plus another driver's trip that must stay hidden.
    const project = (await pool.query(`INSERT INTO projects(organization_id,code,name,status) VALUES($1,$2,'Driver Works','ACTIVE') RETURNING id`, [org, 'DP-' + suffix])).rows[0].id;
    const vehicle = (await pool.query(`INSERT INTO fleet_vehicles(organization_id,project_id,vehicle_number,model) VALUES($1,$2,$3,'Tipper') RETURNING id`, [org, project, 'WP-' + suffix])).rows[0].id;
    const mine = (await pool.query(`INSERT INTO fleet_drivers(organization_id,project_id,name,phone,license_number,license_expiry,user_id) VALUES($1,$2,'Linked Driver','0771234567',$3,current_date+365,$4) RETURNING id`, [org, project, 'L-' + suffix, userId])).rows[0].id;
    const other = (await pool.query(`INSERT INTO fleet_drivers(organization_id,project_id,name,phone,license_number,license_expiry) VALUES($1,$2,'Other Driver','0777654321',$3,current_date+365) RETURNING id`, [org, project, 'O-' + suffix])).rows[0].id;
    const creator = (await pool.query('SELECT id FROM users WHERE email=$1', [adminEmail])).rows[0].id;
    for (const [d, hours] of [[mine, 2], [other, 30]] as const) await pool.query(`INSERT INTO vehicle_assignments(organization_id,project_id,vehicle_id,driver_id,starts_at,ends_at,load_quantity,created_by) VALUES($1,$2,$3,$4,now()+make_interval(hours=>$5::int),now()+make_interval(hours=>$5::int+3),4,$6)`, [org, project, vehicle, d, hours, creator]);
    const trips = (await driver.get('/api/v1/driver/assignments')).body.data.rows;
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ vehicle_number: 'WP-' + suffix, project_name: 'Driver Works', status: 'SCHEDULED' });
    dash = (await driver.get('/api/v1/driver/dashboard')).body.data;
    expect(dash.cards.find((c: { label: string }) => c.label === 'Upcoming trips').value).toBe(1);
    expect(dash.alerts).toEqual([]);
    // Managers cannot see the driver portal either.
    expect((await admin.get('/api/v1/driver/assignments')).status).toBe(403);
  });
});
