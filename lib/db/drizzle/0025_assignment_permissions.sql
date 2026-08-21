ALTER TABLE product_assignments
ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;
