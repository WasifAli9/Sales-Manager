/**
 * Org-wide daily email send limit settings (owner only).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { teamMembersTable, usersTable } from "@workspace/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import {
  getOrgEmailSendSettings,
  getQuotaStatus,
  updateOrgEmailSendSettings,
} from "../lib/emailDailyQuota";

const router: IRouter = Router();

function requireOwner(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  if (req.user!.role !== "owner") {
    res.status(403).json({ error: "Owner only" });
    return false;
  }
  return true;
}

router.get("/settings/email-send-limits", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const settings = await getOrgEmailSendSettings();
  const myQuota = await getQuotaStatus(req.user!.id);
  res.json({ settings, myQuota });
});

router.patch("/settings/email-send-limits", async (req, res) => {
  if (!requireOwner(req, res)) return;
  const body = z
    .object({
      enabled: z.boolean().optional(),
      dailyMax: z.number().int().min(1).max(10_000).optional(),
      dailyMin: z.number().int().min(1).max(10_000).nullable().optional(),
    })
    .safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (
    body.data.dailyMin != null &&
    body.data.dailyMax != null &&
    body.data.dailyMin > body.data.dailyMax
  ) {
    res.status(400).json({ error: "dailyMin cannot exceed dailyMax" });
    return;
  }

  const current = await getOrgEmailSendSettings();
  const dailyMax = body.data.dailyMax ?? current.dailyMax;
  const dailyMin = body.data.dailyMin !== undefined ? body.data.dailyMin : current.dailyMin;
  if (dailyMin != null && dailyMin > dailyMax) {
    res.status(400).json({ error: "dailyMin cannot exceed dailyMax" });
    return;
  }

  const settings = await updateOrgEmailSendSettings({
    enabled: body.data.enabled ?? current.enabled,
    dailyMax,
    dailyMin,
  });
  res.json({ settings });
});

/** Today's quota for all team members with linked accounts. */
router.get("/settings/email-send-limits/team-today", async (req, res) => {
  if (!requireOwner(req, res)) return;

  const members = await db
    .select({
      teamMemberId: teamMembersTable.id,
      name: teamMembersTable.name,
      userId: teamMembersTable.userId,
    })
    .from(teamMembersTable)
    .where(isNotNull(teamMembersTable.userId));

  const ownerUsers = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.role, "owner"));

  const rows = [];
  for (const m of members) {
    if (!m.userId) continue;
    const quota = await getQuotaStatus(m.userId);
    rows.push({ name: m.name, userId: m.userId, ...quota });
  }
  for (const o of ownerUsers) {
    const quota = await getQuotaStatus(o.id);
    rows.push({ name: o.name ?? "Owner", userId: o.id, ...quota });
  }

  res.json({ members: rows });
});

export default router;
