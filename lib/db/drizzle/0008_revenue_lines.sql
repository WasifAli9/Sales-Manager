-- Revenue lines: product-level definitions that span all years
CREATE TABLE IF NOT EXISTS "revenue_lines" (
  "id" SERIAL PRIMARY KEY,
  "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit_value" NUMERIC(14, 4) NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "revenue_lines_product_name_unique" UNIQUE("product_id", "name")
);

-- Link monthly entries to a revenue line definition
ALTER TABLE "sales_targets" ADD COLUMN IF NOT EXISTS "revenue_line_id" INTEGER REFERENCES "revenue_lines"("id") ON DELETE CASCADE;
-- Volume of units for this month (revenue = unit_value × unit_volume)
ALTER TABLE "sales_targets" ADD COLUMN IF NOT EXISTS "unit_volume" NUMERIC(14, 4);

-- Unique constraint for new-style entries (revenue_line_id + year + month)
CREATE UNIQUE INDEX IF NOT EXISTS "sales_targets_rl_year_month_idx"
  ON "sales_targets"("revenue_line_id", "year", "month")
  WHERE "revenue_line_id" IS NOT NULL;
