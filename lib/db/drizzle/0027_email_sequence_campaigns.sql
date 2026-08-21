CREATE TABLE IF NOT EXISTS "contact_lists" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "product_id" integer,
  "created_by_user_id" varchar,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_list_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "list_id" integer NOT NULL,
  "lead_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_list_id_contact_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contact_list_members_unique" ON "contact_list_members" USING btree ("list_id","lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_list_members_list_idx" ON "contact_list_members" USING btree ("list_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL,
  "name" text NOT NULL,
  "sequence_id" integer,
  "contact_list_id" integer,
  "created_by_user_id" varchar,
  "starts_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_contact_list_id_contact_lists_id_fk" FOREIGN KEY ("contact_list_id") REFERENCES "public"."contact_lists"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_campaigns_batch_id_unique" ON "email_campaigns" USING btree ("batch_id");