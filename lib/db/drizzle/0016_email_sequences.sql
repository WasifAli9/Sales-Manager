CREATE TABLE IF NOT EXISTS "email_sequences" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "product_id" integer REFERENCES "products"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_sequence_steps" (
  "id" serial PRIMARY KEY NOT NULL,
  "sequence_id" integer NOT NULL REFERENCES "email_sequences"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "delay_days" integer DEFAULT 0 NOT NULL,
  "name" text,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_sends"
  ADD COLUMN IF NOT EXISTS "sequence_id" integer REFERENCES "email_sequences"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "sequence_step_id" integer REFERENCES "email_sequence_steps"("id") ON DELETE SET NULL;
