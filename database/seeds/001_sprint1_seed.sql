-- ==============================================================================
-- QORVENZ TECH — SPRINT 1 SEED DATA
-- Description: Development seed dataset for testing environment setup
-- ==============================================================================

-- 1. Default Organization
INSERT INTO organizations (id, name, code, address)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Qorvenz Construction Infrastructure Ltd.',
    'QOR-HQ-01',
    '100 Engineering Blvd, Colombo'
)
ON CONFLICT (code) DO NOTHING;

-- 2. Development Administrator User (password: Password123! - bcrypt hash)
INSERT INTO users (id, organization_id, email, password_hash, full_name, role)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'admin@qorvenz.local',
    '$2b$10$r8jR1.aRjR0M8Q11d5X87OQ6m.5Oq1y8v2q9kM9N9X5k9N5k9N5k9',
    'System Administrator',
    'ADMIN'
)
ON CONFLICT (email) DO NOTHING;

-- 3. Sample Warehouse
INSERT INTO warehouses (id, organization_id, name, code, location, capacity)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Central Cement & Aggregates Yard',
    'WH-CENTRAL-01',
    'Sector 4 Logistics Hub',
    50000.00
)
ON CONFLICT (code) DO NOTHING;

-- 4. Sample Fleet Vehicle
INSERT INTO fleet_vehicles (id, organization_id, vehicle_number, model, status, capacity_tons)
VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'WP-CB-4092',
    'Volvo FMX 440 Heavy Tipper',
    'AVAILABLE',
    32.00
)
ON CONFLICT (vehicle_number) DO NOTHING;
