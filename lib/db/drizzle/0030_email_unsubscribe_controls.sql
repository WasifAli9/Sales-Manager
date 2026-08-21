ALTER TABLE "products" ADD COLUMN "unsubscribe_footer_text" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unsubscribe_sender_label" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unsubscribe_support_email" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "unsubscribed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "unsubscribe_source" text;
--> statement-breakpoint
ALTER TABLE "email_sends" ADD COLUMN "unsubscribe_token" text;
--> statement-breakpoint
CREATE INDEX "leads_unsubscribed_at_idx" ON "leads" USING btree ("unsubscribed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "email_sends_unsubscribe_token_unique" ON "email_sends" USING btree ("unsubscribe_token");