DROP TABLE supplier_receipt_commitments, requisition_decisions, requisition_items;
DROP TABLE requisition_approval_policies, requisitions, material_conversions;
DROP FUNCTION prevent_procurement_history_change();
ALTER TABLE stock_documents DROP CONSTRAINT supplier_receipt_id_org_unique;
ALTER TABLE sites DROP CONSTRAINT requisition_site_project_org_unique;
ALTER TABLE materials
  DROP CONSTRAINT materials_catalog_unit_fk,
  DROP CONSTRAINT materials_catalog_category_fk,
  DROP COLUMN specifications;
DROP TABLE catalog_units, material_categories;
