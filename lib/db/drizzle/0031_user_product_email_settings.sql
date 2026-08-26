CREATE TABLE IF NOT EXISTS "user_product_email_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL,
  "product_id" integer NOT NULL,
  "from_name" text,
  "from_email" text,
  "email_signature" text,
  "unsubscribe_footer_text" text,
  "unsubscribe_sender_label" text,
  "unsubscribe_support_email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_product_email_settings"
    ADD CONSTRAINT "user_product_email_settings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_product_email_settings"
    ADD CONSTRAINT "user_product_email_settings_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_product_email_settings_user_product_uidx"
  ON "user_product_email_settings" USING btree ("user_id", "product_id");
