-- Remediation: ensure social_image_style columns and product_assets table exist.
-- This is safe to run even if 0022/0023 partially applied previously.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "social_image_style" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "social_image_style_preset" text;

CREATE TABLE IF NOT EXISTS "product_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "name" text NOT NULL,
  "type" text DEFAULT 'logo' NOT NULL,
  "storage_url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "product_assets_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
    ON DELETE CASCADE ON UPDATE no action
);
