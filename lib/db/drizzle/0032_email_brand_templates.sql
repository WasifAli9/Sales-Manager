CREATE TABLE IF NOT EXISTS "email_brand_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "logo_asset_id" integer,
  "primary_color" text DEFAULT '#0F766E',
  "secondary_color" text DEFAULT '#134E4A',
  "accent_color" text DEFAULT '#14B8A6',
  "background_color" text DEFAULT '#FFFFFF',
  "text_color" text DEFAULT '#0F172A',
  "font_stack" text DEFAULT '-apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "email_brand_profiles"
    ADD CONSTRAINT "email_brand_profiles_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "email_brand_profiles"
    ADD CONSTRAINT "email_brand_profiles_logo_asset_id_product_assets_id_fk"
    FOREIGN KEY ("logo_asset_id") REFERENCES "public"."product_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "email_brand_profiles_product_uidx"
  ON "email_brand_profiles" USING btree ("product_id");

CREATE TABLE IF NOT EXISTS "email_design_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "name" text NOT NULL,
  "category" text DEFAULT 'custom' NOT NULL,
  "design_intensity" integer DEFAULT 1 NOT NULL,
  "html_shell" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "email_design_templates"
    ADD CONSTRAINT "email_design_templates_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "email_sequences" ADD COLUMN IF NOT EXISTS "logo_asset_id" integer;
ALTER TABLE "email_sequences" ADD COLUMN IF NOT EXISTS "design_template_id" integer;
ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "design_template_id" integer;

DO $$ BEGIN
  ALTER TABLE "email_sequences"
    ADD CONSTRAINT "email_sequences_logo_asset_id_product_assets_id_fk"
    FOREIGN KEY ("logo_asset_id") REFERENCES "public"."product_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "email_sequences"
    ADD CONSTRAINT "email_sequences_design_template_id_email_design_templates_id_fk"
    FOREIGN KEY ("design_template_id") REFERENCES "public"."email_design_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "email_sequence_steps"
    ADD CONSTRAINT "email_sequence_steps_design_template_id_email_design_templates_id_fk"
    FOREIGN KEY ("design_template_id") REFERENCES "public"."email_design_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
