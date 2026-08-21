ALTER TABLE "email_sends"
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "opened_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "open_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "clicked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_clicked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "click_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_clicked_url" text,
  ADD COLUMN IF NOT EXISTS "bounced_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "bounce_type" text,
  ADD COLUMN IF NOT EXISTS "bounce_message" text;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_resend_id_idx" ON "email_sends" ("resend_id");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_tracking_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "email_send_id" integer NOT NULL REFERENCES "email_sends"("id") ON DELETE CASCADE,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "click_url" text,
  "bounce_type" text,
  "bounce_message" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_tracking_events_provider_event_id_idx"
  ON "email_tracking_events" ("provider_event_id");
CREATE INDEX IF NOT EXISTS "email_tracking_events_email_send_id_idx"
  ON "email_tracking_events" ("email_send_id");
CREATE INDEX IF NOT EXISTS "email_tracking_events_type_idx"
  ON "email_tracking_events" ("event_type");