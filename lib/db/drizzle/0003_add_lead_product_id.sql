ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "product_id" integer REFERENCES "products"("id") ON DELETE SET NULL;
