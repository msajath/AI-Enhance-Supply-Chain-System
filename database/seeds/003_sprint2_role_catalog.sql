-- Repeatable catalog seeding; never creates users or changes passwords/assignments.
-- Requires migration 006. New organizations also receive these rows automatically.
SELECT seed_organization_roles(id) FROM organizations;
