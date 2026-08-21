-- Change email_sends.lead_id from ON DELETE CASCADE to ON DELETE SET NULL.
-- This preserves send history (for audit trails and campaign analytics) even
-- after the associated lead record is deleted. lead_id becomes nullable;
-- existing NOT NULL rows are unaffected — only future deletes are impacted.

--> statement-breakpoint
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_lead_id_leads_id_fk";

--> statement-breakpoint
ALTER TABLE "email_sends" ALTER COLUMN "lead_id" DROP NOT NULL;

--> statement-breakpoint
ALTER TABLE "email_sends"
  ADD CONSTRAINT "email_sends_lead_id_leads_id_fk"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
  ON DELETE SET NULL;
