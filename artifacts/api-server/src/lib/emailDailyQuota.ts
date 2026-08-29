/**
 * Org-wide daily email send limits per team member.
 */
import { and, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  emailSendsTable,
  leadsTable,
  orgEmailSendSettingsTable,
  userEmailDailyQuotasTable,
} from "@workspace/db/schema";

export type OrgEmailSendSettings = {
  enabled: boolean;
  dailyMax: number;
  dailyMin: number | null;
};

const DEFAULT_SETTINGS: OrgEmailSendSettings = {
  enabled: false,
  dailyMax: 100,
  dailyMin: null,
};

export function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function utcDayBounds(dateKey: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
}

export function addUtcDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export async function getOrgEmailSendSettings(): Promise<OrgEmailSendSettings> {
  const [row] = await db.select().from(orgEmailSendSettingsTable).where(eq(orgEmailSendSettingsTable.id, 1)).limit(1);
  if (!row) return DEFAULT_SETTINGS;
  return {
    enabled: row.enabled,
    dailyMax: row.dailyMax,
    dailyMin: row.dailyMin,
  };
}

export async function updateOrgEmailSendSettings(patch: Partial<OrgEmailSendSettings>) {
  const [existing] = await db.select().from(orgEmailSendSettingsTable).where(eq(orgEmailSendSettingsTable.id, 1)).limit(1);
  if (!existing) {
    await db.insert(orgEmailSendSettingsTable).values({
      id: 1,
      enabled: patch.enabled ?? false,
      dailyMax: patch.dailyMax ?? 100,
      dailyMin: patch.dailyMin ?? null,
    });
  } else {
    await db
      .update(orgEmailSendSettingsTable)
      .set({
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.dailyMax !== undefined ? { dailyMax: patch.dailyMax } : {}),
        ...(patch.dailyMin !== undefined ? { dailyMin: patch.dailyMin } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orgEmailSendSettingsTable.id, 1));
  }
  return getOrgEmailSendSettings();
}

function randomAllowance(min: number, max: number): number {
  if (max <= min) return max;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Stable randomized daily cap for a user (cached per UTC day). */
export async function getDailyAllowance(userId: string, dateKey = utcDateKey()): Promise<number> {
  const settings = await getOrgEmailSendSettings();
  if (!settings.enabled) return Number.MAX_SAFE_INTEGER;

  const [existing] = await db
    .select()
    .from(userEmailDailyQuotasTable)
    .where(and(eq(userEmailDailyQuotasTable.userId, userId), eq(userEmailDailyQuotasTable.quotaDate, dateKey)))
    .limit(1);
  if (existing) return existing.allowedCount;

  const min = settings.dailyMin != null && settings.dailyMin < settings.dailyMax
    ? Math.max(1, settings.dailyMin)
    : settings.dailyMax;
  const allowed = randomAllowance(min, settings.dailyMax);

  await db
    .insert(userEmailDailyQuotasTable)
    .values({ userId, quotaDate: dateKey, allowedCount: allowed })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(userEmailDailyQuotasTable)
    .where(and(eq(userEmailDailyQuotasTable.userId, userId), eq(userEmailDailyQuotasTable.quotaDate, dateKey)))
    .limit(1);
  return row?.allowedCount ?? allowed;
}

export function resolveQuotaUserId(
  scheduledByUserId: string | null | undefined,
  leadAssigneeId: string | null | undefined,
): string | null {
  return scheduledByUserId ?? leadAssigneeId ?? null;
}

async function countSentForUserOnDay(userId: string, dateKey: string): Promise<number> {
  const { start, end } = utcDayBounds(dateKey);
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(emailSendsTable)
    .leftJoin(leadsTable, eq(emailSendsTable.leadId, leadsTable.id))
    .where(
      and(
        eq(emailSendsTable.status, "sent"),
        gte(emailSendsTable.sentAt, start),
        lt(emailSendsTable.sentAt, new Date(end.getTime() + 1)),
        or(
          eq(emailSendsTable.scheduledByUserId, userId),
          and(
            sql`${emailSendsTable.scheduledByUserId} IS NULL`,
            eq(leadsTable.assignedToUserId, userId),
          ),
        ),
      ),
    );
  return row?.count ?? 0;
}

export async function getQuotaStatus(userId: string, dateKey = utcDateKey()) {
  const settings = await getOrgEmailSendSettings();
  if (!settings.enabled) {
    return { enabled: false, allowed: null as number | null, sent: 0, remaining: null as number | null, date: dateKey };
  }
  const allowed = await getDailyAllowance(userId, dateKey);
  const sent = await countSentForUserOnDay(userId, dateKey);
  return {
    enabled: true,
    allowed,
    sent,
    remaining: Math.max(0, allowed - sent),
    date: dateKey,
  };
}

export async function canSendOneMore(userId: string, dateKey = utcDateKey()): Promise<boolean> {
  const status = await getQuotaStatus(userId, dateKey);
  if (!status.enabled) return true;
  return (status.remaining ?? 0) > 0;
}

/**
 * Spread bulk sends across days using org daily max (conservative planning).
 */
export function spreadSendTime(baseDate: Date, indexInBatch: number, dailyMax: number, gapMs: number): Date {
  const dayOffset = Math.floor(indexInBatch / dailyMax);
  const posInDay = indexInBatch % dailyMax;
  const dayStart = addUtcDays(baseDate, dayOffset);
  dayStart.setUTCHours(baseDate.getUTCHours(), baseDate.getUTCMinutes(), baseDate.getUTCSeconds(), baseDate.getUTCMilliseconds());
  return new Date(dayStart.getTime() + posInDay * gapMs);
}

export async function findNextAvailableSendSlot(userId: string, from: Date): Promise<Date> {
  const settings = await getOrgEmailSendSettings();
  if (!settings.enabled) return from;

  let cursor = new Date(from);
  for (let guard = 0; guard < 366; guard++) {
    const dateKey = utcDateKey(cursor);
    const allowed = await getDailyAllowance(userId, dateKey);
    const sent = await countSentForUserOnDay(userId, dateKey);
    if (sent < allowed) {
      return cursor;
    }
    const next = addUtcDays(cursor, 1);
    next.setUTCHours(9, 0, 0, 0);
    cursor = next;
  }
  return cursor;
}
