import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { contactListsTable, emailCampaignsTable, emailSendsTable, emailSequencesTable, leadsTable, productsTable } from "@workspace/db/schema";
import { eq, and, lte, gte, inArray, isNotNull, sql, desc, min, max } from "drizzle-orm";
import { emailTemplatesTable } from "@workspace/db/schema";
import { sendEmail, interpolate, type EmailAttachment } from "../lib/email";
import { logger } from "../lib/logger";
import { validateScheduledFor } from "../lib/validateScheduledFor";
import { canAccessProduct } from "../lib/productAccess";
import { appendUnsubscribeFooter, createUnsubscribeToken, unsubscribeHeaders } from "../lib/unsubscribe";

interface ProductConfig {
  from: string | undefined;
  signature: string | undefined;
  productName: string | undefined;
  footerText: string | undefined;
  senderLabel: string | undefined;
  supportEmail: string | undefined;
}

/** Resolve the product-level email config for a lead.
 *  Returns the From address and email signature (if set on the product).
 *  Falls back to workspace defaults when fields are absent. */
async function resolveProductConfig(leadId: number): Promise<ProductConfig> {
  const [lead] = await db.select({ productId: leadsTable.productId })
    .from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  if (!lead?.productId) {
    return {
      from: undefined, signature: undefined, productName: undefined,
      footerText: undefined, senderLabel: undefined, supportEmail: undefined,
    };
  }
  const [product] = await db
    .select({
      fromEmail: productsTable.fromEmail,
      fromName: productsTable.fromName,
      emailSignature: productsTable.emailSignature,
      name: productsTable.name,
      unsubscribeFooterText: productsTable.unsubscribeFooterText,
      unsubscribeSenderLabel: productsTable.unsubscribeSenderLabel,
      unsubscribeSupportEmail: productsTable.unsubscribeSupportEmail,
    })
    .from(productsTable).where(eq(productsTable.id, lead.productId)).limit(1);
  if (!product) {
    return {
      from: undefined, signature: undefined, productName: undefined,
      footerText: undefined, senderLabel: undefined, supportEmail: undefined,
    };
  }
  const from = product.fromEmail
    ? `${product.fromName?.trim() || product.fromEmail} <${product.fromEmail}>`
    : undefined;
  return {
    from,
    signature: product.emailSignature ?? undefined,
    productName: product.name,
    footerText: product.unsubscribeFooterText ?? undefined,
    senderLabel: product.unsubscribeSenderLabel ?? undefined,
    supportEmail: product.unsubscribeSupportEmail ?? undefined,
  };
}

// Keep the old name as a convenience alias for callers that only need From
async function resolveFrom(leadId: number): Promise<string | undefined> {
  return (await resolveProductConfig(leadId)).from;
}

/** Returns true when the error is a PostgreSQL unique-constraint violation (23505) */
function isDuplicateScheduledError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}

const router: IRouter = Router();

async function canAccessCampaign(req: Request, batchId: string): Promise<boolean> {
  if (req.user!.role === "owner") return true;

  const [campaign] = await db
    .select({
      createdByUserId: emailCampaignsTable.createdByUserId,
      sequenceProductId: emailSequencesTable.productId,
      listProductId: contactListsTable.productId,
      listCreatedByUserId: contactListsTable.createdByUserId,
      contactListId: emailCampaignsTable.contactListId,
    })
    .from(emailCampaignsTable)
    .leftJoin(emailSequencesTable, eq(emailCampaignsTable.sequenceId, emailSequencesTable.id))
    .leftJoin(contactListsTable, eq(emailCampaignsTable.contactListId, contactListsTable.id))
    .where(eq(emailCampaignsTable.batchId, batchId))
    .limit(1);

  if (campaign) {
    // Members can only inspect or cancel campaigns they launched. List campaigns
    // additionally require the list to remain theirs; tag audiences have no list.
    if (campaign.createdByUserId !== req.user!.id) return false;
    if (campaign.contactListId !== null && campaign.listCreatedByUserId !== req.user!.id) return false;
    const productIds = [...new Set([campaign.sequenceProductId, campaign.listProductId].filter((id): id is number => id !== null))];
    return (await Promise.all(productIds.map((productId) => canAccessProduct(req, productId)))).every(Boolean);
  }

  // Legacy bulk campaigns have no campaign ownership record. Do not expose
  // them to a member unless every recipient remains assigned to that member
  // and every associated product is still in their product scope.
  const sends = await db
    .select({
      leadId: emailSendsTable.leadId,
      assignedToUserId: leadsTable.assignedToUserId,
      productId: leadsTable.productId,
    })
    .from(emailSendsTable)
    .leftJoin(leadsTable, eq(emailSendsTable.leadId, leadsTable.id))
    .where(eq(emailSendsTable.batchId, batchId));
  if (!sends.length || sends.some((send) => !send.leadId || send.assignedToUserId !== req.user!.id)) return false;
  const productIds = [...new Set(sends.map((send) => send.productId).filter((id): id is number => id !== null))];
  return (await Promise.all(productIds.map((productId) => canAccessProduct(req, productId)))).every(Boolean);
}

// ── GET /api/email-templates/:id/sent-lead-ids ────────────────────────────
// Returns the set of lead IDs that have already been sent (or have a pending/
// scheduled send) for this template — so the caller can exclude them.
router.get("/email-templates/:id/sent-lead-ids", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const templateId = parseInt(String(req.params.id), 10);
  if (isNaN(templateId)) { res.status(400).json({ error: "invalid id" }); return; }

  const rows = await db
    .selectDistinct({ leadId: emailSendsTable.leadId })
    .from(emailSendsTable)
    .where(
      and(
        eq(emailSendsTable.templateId, templateId),
        sql`${emailSendsTable.status} NOT IN ('cancelled', 'failed')`
      )
    );

  res.json(rows.map(r => r.leadId));
});

// ── Send or schedule an email to a lead ────────────────────────────────────
// POST /api/leads/:id/send-email
router.post("/leads/:id/send-email", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const leadId = parseInt(String(req.params.id), 10);
  if (isNaN(leadId)) { res.status(400).json({ error: "invalid lead id" }); return; }

  const {
    templateId,
    subject,
    body,
    attachments,
    scheduledFor,
  } = req.body as {
    templateId?: number;
    subject: string;
    body: string;
    attachments?: EmailAttachment[];
    scheduledFor?: string; // ISO date string; omit = send immediately
  };

  if (!subject || !body) {
    res.status(400).json({ error: "subject and body required" });
    return;
  }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  if (!lead) { res.status(404).json({ error: "lead not found" }); return; }
  if (req.user.role !== "owner" && lead.assignedToUserId !== req.user.id) {
    res.status(403).json({ error: "You can only send email to contacts assigned to you" });
    return;
  }
  if (lead.productId && !await canAccessProduct(req, lead.productId)) {
    res.status(403).json({ error: "You do not have access to this contact's product" });
    return;
  }
  if (!lead.email) { res.status(400).json({ error: "lead has no email address" }); return; }
  if (lead.unsubscribedAt) {
    res.json({ skipped: true, skipReason: "unsubscribed" });
    return;
  }

  // Interpolate template vars
    const vars = {
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      company: lead.company ?? "",
      title: lead.title ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
    };
  const resolvedSubject = interpolate(subject, vars);
  const resolvedBody = interpolate(body, vars);

  const productConfig = await resolveProductConfig(lead.id);
  const token = createUnsubscribeToken();
  const bodyWithControls = appendUnsubscribeFooter(
    appendSignature(resolvedBody, productConfig.signature),
    token,
    productConfig,
  );

  // Scheduled for later?
  if (scheduledFor) {
  const validation = validateScheduledFor(scheduledFor);
    if (!validation.ok) {
      res.status(validation.status).json({ error: validation.error });
      return;
    }

    try {
      const [send] = await db
        .insert(emailSendsTable)
        .values({
          leadId,
          templateId: templateId ?? null,
          toAddress: lead.email,
          fromAddress: productConfig.from ?? null,
          subject: resolvedSubject,
          body: bodyWithControls,
          unsubscribeToken: token,
          status: "scheduled",
          scheduledFor: validation.date,
        })
        .returning();

      res.status(201).json(send);
    } catch (err: unknown) {
      if (isDuplicateScheduledError(err)) {
        res.status(409).json({ error: "A scheduled send for this lead and template already exists" });
      } else {
        throw err;
      }
    }
    return;
  }

  // Send immediately
  const [send] = await db
    .insert(emailSendsTable)
    .values({
      leadId,
      templateId: templateId ?? null,
      toAddress: lead.email,
      fromAddress: productConfig.from ?? null,
      subject: resolvedSubject,
      body: bodyWithControls,
      unsubscribeToken: token,
      status: "pending",
    })
    .returning();

  // Claim the row only while its lead remains eligible. From this point it is
  // in flight; opt-outs cancel scheduled work, not already-started delivery.
  const [claimed] = await db
    .update(emailSendsTable)
    .set({ status: "pending" })
    .where(and(
      eq(emailSendsTable.id, send.id),
      eq(emailSendsTable.status, "pending"),
      sql`EXISTS (SELECT 1 FROM ${leadsTable} WHERE ${leadsTable.id} = ${leadId} AND ${leadsTable.unsubscribedAt} IS NULL)`,
    ))
    .returning({ id: emailSendsTable.id });
  if (!claimed) {
    await db.update(emailSendsTable)
      .set({ status: "cancelled", errorMessage: "Recipient unsubscribed" })
      .where(and(eq(emailSendsTable.id, send.id), eq(emailSendsTable.status, "pending")));
    res.json({ skipped: true, skipReason: "unsubscribed" });
    return;
  }

  const resendId = await sendEmail({
    to: lead.email,
    subject: resolvedSubject,
    html: wrapHtml(bodyWithControls),
    attachments,
    from: productConfig.from,
    headers: unsubscribeHeaders(token),
  });

  const [updated] = await db
    .update(emailSendsTable)
    .set({
      status: resendId ? "sent" : "failed",
      resendId: resendId ?? null,
      sentAt: resendId ? new Date() : null,
      errorMessage: resendId ? null : "Resend returned no ID",
    })
    .where(and(eq(emailSendsTable.id, send.id), eq(emailSendsTable.status, "pending")))
    .returning();

  // Log email action on the lead; also advance "new" → "contacted"
  if (resendId && updated) {
    await db
      .update(leadsTable)
      .set({
        ...(lead.status === "new" ? { status: "contacted" } : {}),
        lastActionType: "email",
        lastActionNote: resolvedSubject,
        lastActionAt: new Date(),
      })
      .where(eq(leadsTable.id, leadId));
  }

  if (!updated) {
    res.json({ skipped: true, skipReason: "unsubscribed" });
    return;
  }
  res.status(resendId ? 200 : 502).json(updated);
});

// ── Email history for a lead ────────────────────────────────────────────────
// GET /api/leads/:id/email-history
router.get("/leads/:id/email-history", async (req: Request, res: Response) => {
  const leadId = parseInt(String(req.params.id), 10);
  if (isNaN(leadId)) { res.status(400).json({ error: "invalid lead id" }); return; }

  const sends = await db
    .select({
      id: emailSendsTable.id,
      leadId: emailSendsTable.leadId,
      toAddress: emailSendsTable.toAddress,
      subject: emailSendsTable.subject,
      status: emailSendsTable.status,
      templateId: emailSendsTable.templateId,
      templateName: emailTemplatesTable.name,
      campaignName: emailCampaignsTable.name,
      scheduledFor: emailSendsTable.scheduledFor,
      sentAt: emailSendsTable.sentAt,
      errorMessage: emailSendsTable.errorMessage,
      createdAt: emailSendsTable.createdAt,
    })
    .from(emailSendsTable)
    .leftJoin(emailTemplatesTable, eq(emailSendsTable.templateId, emailTemplatesTable.id))
    .leftJoin(emailCampaignsTable, eq(emailSendsTable.batchId, emailCampaignsTable.batchId))
    .where(eq(emailSendsTable.leadId, leadId))
    .orderBy(desc(emailSendsTable.createdAt));

  res.json(sends);
});

// ── Check which leads were emailed recently ─────────────────────────────────
// POST /api/leads/check-recent-emails (legacy alias)
// POST /api/leads/bulk-email-recency-check (current)
// Body: { leadIds: number[], withinDays?: number }
// Returns: { recentLeadIds: number[], recentLeads: { leadId, lastSentAt }[] }
async function bulkEmailRecencyCheck(req: Request, res: Response): Promise<void> {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { leadIds, withinDays = 3 } = req.body as {
    leadIds: number[];
    withinDays?: number;
  };
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    res.json({ recentLeadIds: [], recentLeads: [], withinDays }); return;
  }
  const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      leadId: emailSendsTable.leadId,
      lastSentAt: max(emailSendsTable.createdAt),
    })
    .from(emailSendsTable)
    .where(
      and(
        inArray(emailSendsTable.leadId, leadIds),
        sql`${emailSendsTable.status} IN ('sent', 'pending', 'scheduled')`,
        gte(emailSendsTable.createdAt, cutoff),
      )
    )
    .groupBy(emailSendsTable.leadId);

  const recentLeads = rows.map(r => ({
    leadId: r.leadId,
    lastSentAt: (r.lastSentAt ?? new Date()).toISOString(),
  }));
  res.json({ recentLeadIds: recentLeads.map(r => r.leadId), recentLeads, withinDays });
}

router.post("/leads/check-recent-emails", bulkEmailRecencyCheck);
router.post("/leads/bulk-email-recency-check", bulkEmailRecencyCheck);

// ── Bulk-schedule emails to many leads ─────────────────────────────────────
// POST /api/leads/bulk-schedule-email
router.post("/leads/bulk-schedule-email", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { leadIds, templateId, subject, body, scheduledFor } = req.body as {
    leadIds: number[];
    templateId?: number | null;
    subject: string;
    body: string;
    scheduledFor: string;
  };

  if (!leadIds?.length || !subject || !body || !scheduledFor) {
    res.status(400).json({ error: "leadIds, subject, body, scheduledFor are required" });
    return;
  }

  const validation = validateScheduledFor(scheduledFor);
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.error });
    return;
  }
  const scheduledDate = validation.date;

  const requestedLeadIds = [...new Set(leadIds)];
  const leads = await db.select().from(leadsTable).where(inArray(leadsTable.id, requestedLeadIds));
  if (req.user.role !== "owner") {
    if (leads.length !== requestedLeadIds.length || leads.some((lead) => lead.assignedToUserId !== req.user.id)) {
      res.status(403).json({ error: "You can only schedule email for contacts assigned to you" });
      return;
    }
    const productIds = [...new Set(leads.map((lead) => lead.productId).filter((id): id is number => id !== null))];
    const hasProductAccess = (await Promise.all(productIds.map((productId) => canAccessProduct(req, productId)))).every(Boolean);
    if (!hasProductAccess) {
      res.status(403).json({ error: "You do not have access to every contact product" });
      return;
    }
  }

  let scheduled = 0;
  let skipped = 0;
  let duplicates = 0;
  let unsubscribed = 0;

  // Pre-fetch leads already with a pending/scheduled send for this template
  const alreadyScheduledLeadIds = new Set<number>();
  if (templateId) {
    const existing = await db
      .select({ leadId: emailSendsTable.leadId })
      .from(emailSendsTable)
      .where(
        and(
          inArray(emailSendsTable.leadId, leadIds),
          eq(emailSendsTable.templateId, templateId),
          eq(emailSendsTable.status, "scheduled"),
        ),
      );
    for (const row of existing) {
      if (row.leadId !== null) alreadyScheduledLeadIds.add(row.leadId);
    }
  }

  // Stagger sends by 45–90 s each to avoid bulk-mail flags
  const MIN_GAP_MS = 45_000;
  const MAX_GAP_MS = 90_000;
  let offsetMs = 0;
  const batchId = randomUUID();

  for (const lead of leads) {
    if (!lead.email) { skipped++; continue; }
    if (lead.unsubscribedAt) { skipped++; unsubscribed++; continue; }
    if (alreadyScheduledLeadIds.has(lead.id)) { duplicates++; skipped++; continue; }

    const vars = {
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      company: lead.company ?? "",
      title: lead.title ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
    };

    const productConfig = await resolveProductConfig(lead.id);
    const token = createUnsubscribeToken();
    const interpolatedBody = interpolate(body, vars);
    const sendAt = new Date(scheduledDate.getTime() + offsetMs);

    try {
      await db.insert(emailSendsTable).values({
        leadId: lead.id,
        templateId: templateId ?? null,
        batchId,
        toAddress: lead.email,
        fromAddress: productConfig.from ?? null,
        subject: interpolate(subject, vars),
        body: appendUnsubscribeFooter(appendSignature(interpolatedBody, productConfig.signature), token, productConfig),
        unsubscribeToken: token,
        status: "scheduled",
        scheduledFor: sendAt,
      });
      scheduled++;
      offsetMs += MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
    } catch (err: unknown) {
      if (isDuplicateScheduledError(err)) {
        duplicates++;
        skipped++;
      } else {
        throw err;
      }
    }
  }

  res.json({ scheduled, skipped, duplicates, unsubscribed, batchId });
});

// ── List campaigns (grouped bulk sends) ────────────────────────────────────
// GET /api/email-campaigns
router.get("/email-campaigns", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rows = await db
    .select({
      batchId: emailSendsTable.batchId,
      templateId: emailSendsTable.templateId,
      templateName: emailTemplatesTable.name,
      campaignName: emailCampaignsTable.name,
      subject: sql<string>`min(${emailSendsTable.subject})`,
      total:     sql<number>`cast(count(*) as int)`,
      scheduled: sql<number>`cast(sum(case when ${emailSendsTable.status} = 'scheduled' then 1 else 0 end) as int)`,
      sent:      sql<number>`cast(sum(case when ${emailSendsTable.status} = 'sent' then 1 else 0 end) as int)`,
      failed:    sql<number>`cast(sum(case when ${emailSendsTable.status} = 'failed' then 1 else 0 end) as int)`,
      cancelled: sql<number>`cast(sum(case when ${emailSendsTable.status} = 'cancelled' then 1 else 0 end) as int)`,
      delivered: sql<number>`cast(sum(case when ${emailSendsTable.deliveredAt} is not null then 1 else 0 end) as int)`,
      opened: sql<number>`cast(sum(case when ${emailSendsTable.openedAt} is not null then 1 else 0 end) as int)`,
      clicked: sql<number>`cast(sum(case when ${emailSendsTable.clickedAt} is not null then 1 else 0 end) as int)`,
      bounced: sql<number>`cast(sum(case when ${emailSendsTable.bouncedAt} is not null then 1 else 0 end) as int)`,
      firstSendAt: min(emailSendsTable.scheduledFor),
      lastSendAt:  max(emailSendsTable.scheduledFor),
      createdAt:   min(emailSendsTable.createdAt),
    })
    .from(emailSendsTable)
    .leftJoin(emailTemplatesTable, eq(emailSendsTable.templateId, emailTemplatesTable.id))
    .leftJoin(emailCampaignsTable, eq(emailSendsTable.batchId, emailCampaignsTable.batchId))
    .where(isNotNull(emailSendsTable.batchId))
    .groupBy(emailSendsTable.batchId, emailSendsTable.templateId, emailTemplatesTable.name, emailCampaignsTable.name)
    .orderBy(desc(min(emailSendsTable.createdAt)));

  const visibleRows = req.user!.role === "owner"
    ? rows
    : (await Promise.all(rows.map(async (row) =>
      row.batchId && await canAccessCampaign(req, row.batchId) ? row : null,
    ))).filter((row): row is (typeof rows)[number] => Boolean(row));

  res.json(visibleRows.map((row) => {
    const delivered = Number(row.delivered ?? 0);
    const opened = Number(row.opened ?? 0);
    const clicked = Number(row.clicked ?? 0);
    const percentage = (numerator: number, denominator: number) =>
      denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;

    return {
      ...row,
      delivered,
      opened,
      clicked,
      bounced: Number(row.bounced ?? 0),
      openRate: percentage(opened, delivered),
      clickThroughRate: percentage(clicked, delivered),
      clickToOpenRate: percentage(clicked, opened),
    };
  }));
});

// ── Campaign detail — individual sends ─────────────────────────────────────
// GET /api/email-campaigns/:batchId
router.get("/email-campaigns/:batchId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const batchId = String(req.params.batchId);
  if (!await canAccessCampaign(req, batchId)) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const sends = await db
    .select({
      id: emailSendsTable.id,
      leadId: emailSendsTable.leadId,
      toAddress: emailSendsTable.toAddress,
      subject: emailSendsTable.subject,
      status: emailSendsTable.status,
      resendId: emailSendsTable.resendId,
      scheduledFor: emailSendsTable.scheduledFor,
      sentAt: emailSendsTable.sentAt,
      errorMessage: emailSendsTable.errorMessage,
      deliveredAt: emailSendsTable.deliveredAt,
      openedAt: emailSendsTable.openedAt,
      lastOpenedAt: emailSendsTable.lastOpenedAt,
      openCount: emailSendsTable.openCount,
      clickedAt: emailSendsTable.clickedAt,
      lastClickedAt: emailSendsTable.lastClickedAt,
      clickCount: emailSendsTable.clickCount,
      lastClickedUrl: emailSendsTable.lastClickedUrl,
      bouncedAt: emailSendsTable.bouncedAt,
      bounceType: emailSendsTable.bounceType,
      bounceMessage: emailSendsTable.bounceMessage,
      createdAt: emailSendsTable.createdAt,
      firstName: leadsTable.firstName,
      lastName: leadsTable.lastName,
      company: leadsTable.company,
    })
    .from(emailSendsTable)
    .leftJoin(leadsTable, eq(emailSendsTable.leadId, leadsTable.id))
    .where(eq(emailSendsTable.batchId, batchId))
    .orderBy(emailSendsTable.scheduledFor);

  res.json(sends);
});

// ── Cancel a pending campaign ───────────────────────────────────────────────
// DELETE /api/email-campaigns/:batchId
router.delete("/email-campaigns/:batchId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const batchId = String(req.params.batchId);
  if (!await canAccessCampaign(req, batchId)) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const result = await db
    .update(emailSendsTable)
    .set({ status: "cancelled", errorMessage: "Cancelled by user" })
    .where(
      and(
        eq(emailSendsTable.batchId, batchId),
        eq(emailSendsTable.status, "scheduled"),
      ),
    )
    .returning({ id: emailSendsTable.id });

  res.json({ cancelled: result.length });
});

// ── Email journal — stats + recent sends ───────────────────────────────────
// GET /api/email-journal
router.get("/email-journal", async (_req: Request, res: Response) => {
  // Summary by status
  const statusRows = await db
    .select({
      status: emailSendsTable.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(emailSendsTable)
    .groupBy(emailSendsTable.status);

  const summary = { total: 0, sent: 0, scheduled: 0, failed: 0, pending: 0 };
  for (const row of statusRows) {
    summary.total += row.count;
    if (row.status === "sent") summary.sent += row.count;
    else if (row.status === "scheduled") summary.scheduled += row.count;
    else if (row.status === "failed") summary.failed += row.count;
    else if (row.status === "pending") summary.pending += row.count;
  }

  // By template
  const byTemplate = await db
    .select({
      templateId: emailSendsTable.templateId,
      templateName: emailTemplatesTable.name,
      total: sql<number>`cast(count(*) as int)`,
      sent: sql<number>`cast(sum(case when ${emailSendsTable.status} = 'sent' then 1 else 0 end) as int)`,
      scheduled: sql<number>`cast(sum(case when ${emailSendsTable.status} = 'scheduled' then 1 else 0 end) as int)`,
      failed: sql<number>`cast(sum(case when ${emailSendsTable.status} = 'failed' then 1 else 0 end) as int)`,
    })
    .from(emailSendsTable)
    .leftJoin(emailTemplatesTable, eq(emailSendsTable.templateId, emailTemplatesTable.id))
    .groupBy(emailSendsTable.templateId, emailTemplatesTable.name)
    .orderBy(desc(sql`count(*)`));

  // Recent sends with lead + template info
  const recent = await db
    .select({
      id: emailSendsTable.id,
      leadId: emailSendsTable.leadId,
      toAddress: emailSendsTable.toAddress,
      subject: emailSendsTable.subject,
      status: emailSendsTable.status,
      scheduledFor: emailSendsTable.scheduledFor,
      sentAt: emailSendsTable.sentAt,
      errorMessage: emailSendsTable.errorMessage,
      createdAt: emailSendsTable.createdAt,
      firstName: leadsTable.firstName,
      lastName: leadsTable.lastName,
      company: leadsTable.company,
      templateName: emailTemplatesTable.name,
    })
    .from(emailSendsTable)
    .leftJoin(leadsTable, eq(emailSendsTable.leadId, leadsTable.id))
    .leftJoin(emailTemplatesTable, eq(emailSendsTable.templateId, emailTemplatesTable.id))
    .orderBy(desc(emailSendsTable.createdAt))
    .limit(200);

  res.json({ summary, byTemplate, recent });
});

// ── Process due scheduled emails (called by scheduler) ─────────────────────
export async function sendScheduledEmails(): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = new Date();
  const due = await db
    .select()
    .from(emailSendsTable)
    .where(
      and(
        eq(emailSendsTable.status, "scheduled"),
        lte(emailSendsTable.scheduledFor, now),
        // cancelled rows are left alone by the scheduler
      ),
    );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const send of due) {
    if (send.leadId == null) {
      await db.update(emailSendsTable)
        .set({ status: "cancelled", errorMessage: "Recipient is no longer available" })
        .where(eq(emailSendsTable.id, send.id));
      skipped++;
      continue;
    }
    const [claimed] = await db
      .update(emailSendsTable)
      .set({ status: "pending" })
      .where(and(
        eq(emailSendsTable.id, send.id),
        eq(emailSendsTable.status, "scheduled"),
        sql`EXISTS (SELECT 1 FROM ${leadsTable} WHERE ${leadsTable.id} = ${send.leadId} AND ${leadsTable.unsubscribedAt} IS NULL)`,
      ))
      .returning({ id: emailSendsTable.id });
    if (!claimed) {
      await db.update(emailSendsTable)
        .set({ status: "cancelled", errorMessage: "Recipient unsubscribed" })
        .where(and(eq(emailSendsTable.id, send.id), eq(emailSendsTable.status, "scheduled")));
      skipped++;
      continue;
    }
    const [currentLead] = await db
      .select({ status: leadsTable.status })
      .from(leadsTable)
      .where(eq(leadsTable.id, send.leadId))
      .limit(1);
    if (!currentLead) {
      await db.update(emailSendsTable)
        .set({ status: "cancelled", errorMessage: "Recipient is no longer available" })
        .where(and(eq(emailSendsTable.id, send.id), eq(emailSendsTable.status, "pending")));
      skipped++;
      continue;
    }

    let token = send.unsubscribeToken;
    let body = send.body;
    if (!token) {
      token = createUnsubscribeToken();
      const productConfig = await resolveProductConfig(send.leadId);
      body = appendUnsubscribeFooter(send.body, token, productConfig);
      await db.update(emailSendsTable)
        .set({ unsubscribeToken: token, body })
      .where(and(eq(emailSendsTable.id, send.id), eq(emailSendsTable.status, "pending")));
    }
    const resendId = await sendEmail({
      to: send.toAddress,
      subject: send.subject,
      html: wrapHtml(body),
      from: send.fromAddress ?? undefined,
      headers: unsubscribeHeaders(token),
    });

    if (resendId) {
      const [sentUpdate] = await db
        .update(emailSendsTable)
        .set({ status: "sent", resendId, sentAt: new Date() })
        .where(and(eq(emailSendsTable.id, send.id), eq(emailSendsTable.status, "pending")))
        .returning({ id: emailSendsTable.id });
      if (!sentUpdate) {
        skipped++;
        continue;
      }

      // Update lead last action + advance "new" → "contacted" (skip if lead deleted)
      if (send.leadId != null) {
        await db
          .update(leadsTable)
          .set({
            ...(currentLead?.status === "new" ? { status: "contacted" } : {}),
            lastActionType: "email",
            lastActionNote: send.subject,
            lastActionAt: new Date(),
          })
          .where(eq(leadsTable.id, send.leadId));
      }

      sent++;
    } else {
      const [failedUpdate] = await db
        .update(emailSendsTable)
        .set({ status: "failed", errorMessage: "Resend returned no ID" })
        .where(and(eq(emailSendsTable.id, send.id), eq(emailSendsTable.status, "pending")))
        .returning({ id: emailSendsTable.id });
      if (failedUpdate) failed++;
      else skipped++;
    }

    // Small jitter between sends as a safety net — bulk-scheduled emails are
    // already staggered at scheduling time, but this guards any other path.
    if (due.length > 1) {
      await new Promise(r => setTimeout(r, 2_000 + Math.floor(Math.random() * 3_000)));
    }
  }

  logger.info({ sent, failed, skipped }, "Scheduled emails processed");
  return { sent, failed, skipped };
}

/** Append a plain-text signature to a body, separated by a line. */
function appendSignature(body: string, signature: string | undefined): string {
  if (!signature?.trim()) return body;
  return `${body}\n\n--\n${signature.trim()}`;
}

// ── Wrap plain text / partial HTML in a branded shell ──────────────────────
function wrapHtml(body: string): string {
  // If already looks like HTML, use as-is
  if (body.trimStart().startsWith("<")) return body;

  // Otherwise wrap plain text with line breaks
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #ffffff; color: #1a1a1a; padding: 32px; max-width: 560px; margin: 0 auto; line-height: 1.6;">
  ${escaped}
</body>
</html>`;
}

export default router;
