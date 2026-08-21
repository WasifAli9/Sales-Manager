-- Cancel duplicate scheduled sends, keeping only the latest one per (lead_id, template_id) pair.
-- This prevents the subsequent CREATE UNIQUE INDEX from failing on existing data.
UPDATE email_sends
SET status = 'cancelled', error_message = 'Cancelled: duplicate scheduled send removed by migration'
WHERE status = 'scheduled'
  AND template_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (lead_id, template_id) id
    FROM email_sends
    WHERE status = 'scheduled'
      AND template_id IS NOT NULL
    ORDER BY lead_id, template_id, created_at DESC
  );

--> statement-breakpoint
-- Unique partial index: at most one scheduled send per (lead, template) pair.
-- Constraint is lifted when status leaves 'scheduled', allowing re-schedules.
-- template_id IS NOT NULL guard ensures ad-hoc (no-template) sends are never blocked.
CREATE UNIQUE INDEX IF NOT EXISTS "email_sends_no_dup_scheduled"
  ON "email_sends" ("lead_id", "template_id")
  WHERE status = 'scheduled' AND template_id IS NOT NULL;
