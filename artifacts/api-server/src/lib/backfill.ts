import { db } from "@workspace/db";
import { leadsTable, emailSendsTable } from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * One-time backfill: advance leads from "new" → "contacted" where at least
 * one email has been successfully sent to them.  Also stamps lastActionType
 * and lastActionAt from their most recent sent email if those fields are blank.
 *
 * Safe to run repeatedly — only touches leads that are still "new".
 */
export async function backfillLeadStatuses(): Promise<void> {
  try {
    // Find lead IDs that have at least one sent email but are still "new"
    const rows = await db
      .selectDistinct({ leadId: emailSendsTable.leadId })
      .from(emailSendsTable)
      .where(
        and(
          eq(emailSendsTable.status, "sent"),
          sql`${emailSendsTable.leadId} IS NOT NULL`,
        ),
      );

    const leadIds = rows
      .map((r) => r.leadId)
      .filter((id): id is number => id !== null);

    if (leadIds.length === 0) {
      logger.info("Backfill: no leads to update");
      return;
    }

    // Update only those that are still "new"
    const result = await db
      .update(leadsTable)
      .set({ status: "contacted" })
      .where(
        and(
          eq(leadsTable.status, "new"),
          inArray(leadsTable.id, leadIds),
        ),
      )
      .returning({ id: leadsTable.id });

    // For each backfilled lead, stamp lastActionType if it's blank
    if (result.length > 0) {
      const updatedIds = result.map((r) => r.id);

      // Get the most recent sent email per updated lead
      const recentSends = await db.execute(sql`
        SELECT DISTINCT ON (es.lead_id)
          es.lead_id,
          es.subject,
          es.sent_at
        FROM email_sends es
        WHERE es.lead_id = ANY(${updatedIds}::int[])
          AND es.status = 'sent'
        ORDER BY es.lead_id, es.sent_at DESC
      `);

      for (const row of recentSends.rows as { lead_id: number; subject: string; sent_at: Date }[]) {
        await db
          .update(leadsTable)
          .set({
            lastActionType: "email",
            lastActionNote: row.subject,
            lastActionAt: row.sent_at,
          })
          .where(
            and(
              eq(leadsTable.id, row.lead_id),
              sql`${leadsTable.lastActionType} IS NULL`,
            ),
          );
      }

      logger.info(
        { count: result.length },
        "Backfill: advanced leads new → contacted",
      );
    } else {
      logger.info("Backfill: all emailed leads already contacted");
    }
  } catch (err) {
    // Non-fatal — log and continue. The server must still start.
    logger.error({ err }, "Backfill: lead status backfill failed (non-fatal)");
  }
}
