CREATE TABLE "lead_tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(64) NOT NULL,
  "normalized_name" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lead_tags_normalized_name_unique" ON "lead_tags" USING btree ("normalized_name");
--> statement-breakpoint
CREATE TABLE "lead_tag_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "tag_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_tag_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_tag_assignments_tag_id_lead_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."lead_tags"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lead_tag_assignments_unique" ON "lead_tag_assignments" USING btree ("lead_id","tag_id");
--> statement-breakpoint
CREATE INDEX "lead_tag_assignments_lead_idx" ON "lead_tag_assignments" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX "lead_tag_assignments_tag_idx" ON "lead_tag_assignments" USING btree ("tag_id");