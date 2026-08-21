ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;

-- Backfill: give each existing product a unique sort_order based on its creation order
UPDATE "products" p
SET "sort_order" = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS rn
  FROM "products"
) sub
WHERE p.id = sub.id;
