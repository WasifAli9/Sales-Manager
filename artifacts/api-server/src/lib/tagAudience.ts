import type { Request } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadTagAssignmentsTable, leadTagsTable, leadsTable } from "@workspace/db/schema";

/**
 * Resolve a tag audience at launch time. The returned IDs are used to create
 * scheduled sends, so later tag edits cannot change a campaign's recipients.
 */
export async function resolveTagAudienceLeadIds(
  req: Request,
  tagIds: number[],
  match: "any" | "all",
  requiredProductId: number | null,
): Promise<number[]> {
  const tags = await db.select({ id: leadTagsTable.id }).from(leadTagsTable).where(inArray(leadTagsTable.id, tagIds));
  if (tags.length !== tagIds.length) throw new Error("One or more selected tags do not exist");

  const conditions = [];
  if (req.user!.role !== "owner") conditions.push(eq(leadsTable.assignedToUserId, req.user!.id));
  if (requiredProductId) conditions.push(eq(leadsTable.productId, requiredProductId));
  if (match === "all") {
    conditions.push(sql`(
      SELECT count(distinct ${leadTagAssignmentsTable.tagId})
      FROM ${leadTagAssignmentsTable}
      WHERE ${eq(leadTagAssignmentsTable.leadId, leadsTable.id)}
        AND ${inArray(leadTagAssignmentsTable.tagId, tagIds)}
    ) = ${tagIds.length}`);
  } else {
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM ${leadTagAssignmentsTable}
      WHERE ${eq(leadTagAssignmentsTable.leadId, leadsTable.id)}
        AND ${inArray(leadTagAssignmentsTable.tagId, tagIds)}
    )`);
  }
  const rows = await db.select({ id: leadsTable.id }).from(leadsTable).where(and(...conditions));
  return rows.map((row) => row.id);
}