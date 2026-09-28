/**
 * Shared lead-list filter builders for GET /api/leads and POST /api/leads/select-next.
 */
import { leadsTable, leadTagAssignmentsTable } from "@workspace/db/schema";
import { eq, ilike, or, inArray, isNull, sql, type SQL } from "drizzle-orm";

export type LeadListFilterParams = {
  status?: string;
  search?: string;
  productId?: string | number;
  leadType?: string;
  tagIds?: string | number[];
  tagMatch?: string;
  assignedToUserId?: string;
};

export type LeadListAuthUser = {
  id: string;
  role: string;
};

export {
  SELECT_NEXT_DEFAULT,
  SELECT_NEXT_MAX,
  SELECT_NEXT_PRESETS,
  parseSelectNextLimit,
  parseExcludeIds,
  mergeSelectedIds,
} from "./leadListQueryHelpers";

function parseTagIdList(tagIds: string | number[] | undefined): number[] {
  if (Array.isArray(tagIds)) {
    return [...new Set(
      tagIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
    )];
  }
  return (tagIds ?? "")
    .split(",")
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * Build Drizzle WHERE conditions for the standard leads list filters.
 * Members are always scoped to their own assigned leads.
 */
export function buildLeadListConditions(
  user: LeadListAuthUser,
  params: LeadListFilterParams,
): SQL[] {
  const conditions: SQL[] = [];
  const {
    status,
    search,
    productId,
    leadType,
    tagIds,
    tagMatch,
    assignedToUserId,
  } = params;

  if (user.role !== "owner") {
    conditions.push(eq(leadsTable.assignedToUserId, user.id));
  } else if (assignedToUserId === "unassigned") {
    conditions.push(isNull(leadsTable.assignedToUserId));
  } else if (assignedToUserId && assignedToUserId !== "all") {
    conditions.push(eq(leadsTable.assignedToUserId, assignedToUserId));
  }

  if (status && status !== "all") {
    conditions.push(eq(leadsTable.status, status));
  }

  if (productId !== undefined && productId !== null && String(productId) !== "all") {
    const pid = typeof productId === "number" ? productId : Number.parseInt(String(productId), 10);
    if (!Number.isNaN(pid)) conditions.push(eq(leadsTable.productId, pid));
  }

  if (leadType === "end_user" || leadType === "reseller") {
    conditions.push(eq(leadsTable.leadType, leadType));
  }

  const selectedTagIds = parseTagIdList(tagIds);
  if (selectedTagIds.length) {
    if (tagMatch === "all") {
      conditions.push(sql`(
        SELECT count(distinct ${leadTagAssignmentsTable.tagId})
        FROM ${leadTagAssignmentsTable}
        WHERE ${eq(leadTagAssignmentsTable.leadId, leadsTable.id)}
          AND ${inArray(leadTagAssignmentsTable.tagId, selectedTagIds)}
      ) = ${selectedTagIds.length}`);
    } else {
      conditions.push(sql`EXISTS (
        SELECT 1
        FROM ${leadTagAssignmentsTable}
        WHERE ${eq(leadTagAssignmentsTable.leadId, leadsTable.id)}
          AND ${inArray(leadTagAssignmentsTable.tagId, selectedTagIds)}
      )`);
    }
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(leadsTable.firstName, term),
        ilike(leadsTable.lastName, term),
        ilike(leadsTable.company, term),
        ilike(leadsTable.email, term),
        ilike(leadsTable.title, term),
      )!,
    );
  }

  return conditions;
}
