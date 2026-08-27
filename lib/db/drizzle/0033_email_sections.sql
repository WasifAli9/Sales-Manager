CREATE TABLE IF NOT EXISTS "email_saved_sections" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text DEFAULT 'custom',
  "tags" jsonb DEFAULT '[]'::jsonb,
  "sections_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "email_saved_sections"
    ADD CONSTRAINT "email_saved_sections_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "sections_json" jsonb;
