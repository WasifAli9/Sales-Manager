import { randomUUID } from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  contactListMembersTable,
  contactListsTable,
  emailCampaignsTable,
  emailSendsTable,
  emailSequencesTable,
  emailSequenceStepsTable,
  leadsTable,
  productsTable,
} from "@workspace/db/schema";
import { runJson } from "../lib/ai";
import { emailBodyToHtml } from "../lib/emailBodyHtml";
import { validateScheduledFor } from "../lib/validateScheduledFor";
import { canAccessProduct } from "../lib/productAccess";
import { resolveTagAudienceLeadIds } from "../lib/tagAudience";
import { appendUnsubscribeFooter, createUnsubscribeToken } from "../lib/unsubscribe";
import { resolveSenderEmailConfig } from "../lib/resolveSenderEmailConfig";
import { loadSequenceDesignContext, renderSequenceStepBody, loadBrandForProduct, resolveStepShell } from "../lib/emailDesignContext";
import { sendEmail } from "../lib/email";
import { coerceSections, renderSectionsBodyFragment } from "../lib/emailSectionRender";
import { appendSignatureHtml, signatureContentHtml } from "../lib/emailSignatureHtml";
import { appPublicUrl } from "../lib/appUrl";
import { getOrgEmailSendSettings, spreadSendTime } from "../lib/emailDailyQuota";

const router: IRouter = Router();

const stepInputSchema = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  delayDays: z.number().int().min(0).max(3650),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().max(25000).optional(),
  sectionsJson: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
  designTemplateId: z.number().int().positive().nullable().optional(),
  abTestEnabled: z.boolean().optional(),
  abTestSplitPercent: z.number().int().min(1).max(99).optional(),
  subjectVariantB: z.string().trim().max(300).optional().nullable(),
  bodyVariantB: z.string().trim().max(25000).optional().nullable(),
  sectionsJsonVariantB: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
  resendIfUnopened: z.boolean().optional(),
  resendAfterHours: z.number().int().min(1).max(720).optional(),
}).superRefine((step, ctx) => {
  const hasSections = Array.isArray(step.sectionsJson) && step.sectionsJson.length > 0;
  const hasBody = typeof step.body === "string" && step.body.trim().length > 0;
  if (!hasSections && !hasBody) {
    ctx.addIssue({ code: "custom", message: "Each email needs body content or sections" });
  }
});

const fullSequenceSchema = z.object({
  sequenceId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  productId: z.number().int().positive().nullable().optional(),
  logoAssetId: z.number().int().positive().nullable().optional(),
  designTemplateId: z.number().int().positive().nullable().optional(),
  steps: z.array(stepInputSchema).min(1).max(365),
});

const generateSequenceSchema = z.object({
  productId: z.number().int().positive(),
  instruction: z.string().trim().min(5),
  emailCount: z.number().int().min(1).max(365),
  delaysBetweenEmails: z.array(z.number().int().min(0).max(365)).max(364),
}).superRefine((value, ctx) => {
  if (value.delaysBetweenEmails.length !== value.emailCount - 1) {
    ctx.addIssue({ code: "custom", message: "Provide one delay for every gap between emails" });
  }
});

const generatedSequenceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  steps: z.array(z.object({
    name: z.string().trim().max(120).optional(),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(25000),
  })).min(1).max(365),
});

const sendTestEmailSchema = z.object({
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().max(25000).optional(),
  sectionsJson: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
  designTemplateId: z.number().int().positive().nullable().optional(),
  sequenceDesignTemplateId: z.number().int().positive().nullable().optional(),
  logoAssetId: z.number().int().positive().nullable().optional(),
  subjectVariantB: z.string().trim().max(300).optional().nullable(),
  bodyVariantB: z.string().trim().max(25000).optional().nullable(),
  variant: z.enum(["A", "B"]).optional(),
}).superRefine((step, ctx) => {
  const hasSections = Array.isArray(step.sectionsJson) && step.sectionsJson.length > 0;
  const hasBody = typeof step.body === "string" && step.body.trim().length > 0;
  if (!hasSections && !hasBody) {
    ctx.addIssue({ code: "custom", message: "Email needs body content or sections" });
  }
});

const TEST_MERGE_LEAD = {
  firstName: "Alex",
  lastName: "Sample",
  company: "Acme Corp",
  title: "Head of Operations",
  email: "alex.sample@example.com",
};

const TEST_EMAIL_BANNER = `<div style="background:#fef3c7;padding:10px 14px;font-size:13px;color:#92400e;margin-bottom:16px;border-radius:6px;text-align:center;"><strong>Test email</strong> — merge fields use sample data (Alex Sample, Acme Corp).</div>`;

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function interpolate(text: string, lead: {
  firstName: string | null; lastName: string | null; company: string | null; title: string | null; email: string | null;
}) {
  return text
    .replace(/{{firstName}}/g, lead.firstName ?? "")
    .replace(/{{lastName}}/g, lead.lastName ?? "")
    .replace(/{{company}}/g, lead.company ?? "")
    .replace(/{{title}}/g, lead.title ?? "")
    .replace(/{{email}}/g, lead.email ?? "");
}

function fromAddress(product: typeof productsTable.$inferSelect | null) {
  if (!product?.fromEmail) return null;
  return `${product.fromName?.trim() || product.fromEmail} <${product.fromEmail}>`;
}

function withSignature(body: string, signature: string | null | undefined) {
  return appendSignatureHtml(body, signature);
}

function pickAbVariant(step: {
  abTestEnabled?: boolean | null;
  abTestSplitPercent?: number | null;
  subjectVariantB?: string | null;
}): "A" | "B" | null {
  if (!step.abTestEnabled || !step.subjectVariantB?.trim()) return null;
  const split = step.abTestSplitPercent ?? 50;
  return Math.random() * 100 < split ? "A" : "B";
}

function stepVariantContent(
  step: {
    subject: string;
    body: string;
    sectionsJson?: unknown[] | null;
    subjectVariantB?: string | null;
    bodyVariantB?: string | null;
    sectionsJsonVariantB?: unknown[] | null;
  },
  variant: "A" | "B" | null,
) {
  if (variant !== "B") {
    return {
      subject: step.subject,
      sections: coerceSections(step.sectionsJson),
      body: step.body,
    };
  }
  const sectionsB = coerceSections(step.sectionsJsonVariantB);
  return {
    subject: step.subjectVariantB!.trim(),
    sections: sectionsB,
    body: step.bodyVariantB ?? step.body,
  };
}

async function bodyCacheFromStep(
  step: { body?: string; sectionsJson?: unknown[] | null },
  productId: number | null | undefined,
): Promise<string> {
  const sections = coerceSections(step.sectionsJson);
  if (sections?.length) {
    const brand = await loadBrandForProduct(productId ?? undefined);
    return renderSectionsBodyFragment(sections, brand, appPublicUrl());
  }
  return step.body?.trim() ?? "";
}

async function getSequence(sequenceId: number) {
  const [sequence] = await db.select().from(emailSequencesTable).where(eq(emailSequencesTable.id, sequenceId)).limit(1);
  return sequence ?? null;
}

async function getAccessibleSequence(req: Request, sequenceId: number) {
  const sequence = await getSequence(sequenceId);
  if (!sequence || (sequence.productId && !await canAccessProduct(req, sequence.productId))) return null;
  return sequence;
}

async function visibleLeadIds(req: Request, requestedIds: number[]) {
  if (!requestedIds.length) return [];
  const conditions = [inArray(leadsTable.id, requestedIds)];
  if (req.user!.role !== "owner") conditions.push(eq(leadsTable.assignedToUserId, req.user!.id));
  const rows = await db.select({ id: leadsTable.id }).from(leadsTable).where(and(...conditions));
  return rows.map((row) => row.id);
}

async function leadProductsAreAccessible(req: Request, leadIds: number[], requiredProductId: number | null) {
  const rows = await db.select({ id: leadsTable.id, productId: leadsTable.productId })
    .from(leadsTable)
    .where(inArray(leadsTable.id, leadIds));
  if (rows.length !== leadIds.length) return false;
  if (requiredProductId && rows.some((lead) => lead.productId !== requiredProductId)) return false;
  if (req.user!.role === "owner") return true;
  const productIds = [...new Set(rows.map((lead) => lead.productId).filter((id): id is number => id !== null))];
  return (await Promise.all(productIds.map((productId) => canAccessProduct(req, productId)))).every(Boolean);
}

function parseAudienceTagIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const tagIds = [...new Set(value)];
  return tagIds.length && tagIds.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)
    ? tagIds as number[]
    : null;
}

async function prepareSequenceSchedule(
  sequenceId: number,
  requestedLeadIds: number[],
  startDate: Date,
  batchId = randomUUID(),
  senderUserId?: string | null,
) {
  const sequence = await getSequence(sequenceId);
  if (!sequence) throw new Error("Sequence not found");
  const steps = await db
    .select()
    .from(emailSequenceStepsTable)
    .where(eq(emailSequenceStepsTable.sequenceId, sequenceId))
    .orderBy(asc(emailSequenceStepsTable.position));
  if (!steps.length) throw new Error("Sequence has no emails");

  const leads = await db
    .select({
      id: leadsTable.id,
      firstName: leadsTable.firstName,
      lastName: leadsTable.lastName,
      email: leadsTable.email,
      company: leadsTable.company,
      title: leadsTable.title,
      productId: leadsTable.productId,
      unsubscribedAt: leadsTable.unsubscribedAt,
    })
    .from(leadsTable)
    .where(inArray(leadsTable.id, requestedLeadIds));
  const emailLeads = leads.filter((lead) => lead.email);
  const eligibleLeads = emailLeads.filter((lead) => !lead.unsubscribedAt);

  const productIds = new Set<number>();
  if (sequence.productId) productIds.add(sequence.productId);
  for (const lead of eligibleLeads) if (lead.productId) productIds.add(lead.productId);
  const products = productIds.size
    ? await db.select().from(productsTable).where(inArray(productsTable.id, [...productIds]))
    : [];
  const productMap = new Map(products.map((product) => [product.id, product]));

  const senderConfigByProduct = new Map<number | null, Awaited<ReturnType<typeof resolveSenderEmailConfig>>>();
  const getSenderConfig = async (productId: number | null) => {
    if (!senderConfigByProduct.has(productId)) {
      senderConfigByProduct.set(productId, await resolveSenderEmailConfig(productId, senderUserId));
    }
    return senderConfigByProduct.get(productId)!;
  };

  const designCtx = await loadSequenceDesignContext({
    productId: sequence.productId,
    brandName: sequence.productId
      ? productMap.get(sequence.productId)?.name
      : products[0]?.name,
    sequenceLogoAssetId: sequence.logoAssetId,
    sequenceDesignTemplateId: sequence.designTemplateId,
    steps: steps.map((s) => ({ id: s.id, designTemplateId: s.designTemplateId })),
  });

  const sectionBrand = await loadBrandForProduct(sequence.productId ?? undefined);
  const origin = appPublicUrl();

  const values = [];
  const orgLimits = await getOrgEmailSendSettings();
  let leadSpreadIndex = 0;
  const MIN_GAP_MS = 45_000;
  const MAX_GAP_MS = 90_000;

  for (const lead of eligibleLeads) {
    const product = (sequence.productId ? productMap.get(sequence.productId) : undefined)
      ?? (lead.productId ? productMap.get(lead.productId) : undefined)
      ?? null;
    const senderConfig = await getSenderConfig(sequence.productId ?? lead.productId ?? null);

    let leadStart = startDate;
    if (orgLimits.enabled) {
      const gapMs = MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
      leadStart = spreadSendTime(startDate, leadSpreadIndex++, orgLimits.dailyMax, gapMs);
    }

    for (const step of steps) {
      const token = createUnsubscribeToken();
      const abVariant = pickAbVariant(step);
      const variantContent = stepVariantContent(step, abVariant);
      const stepSections = variantContent.sections;
      const rawContent = stepSections?.length
        ? renderSectionsBodyFragment(stepSections, sectionBrand, origin)
        : variantContent.body;
      const contentBody = interpolate(rawContent, lead);
      const signature = senderConfig.signature ?? product?.emailSignature;
      const stepShell =
        (step.designTemplateId && designCtx.stepTemplateShells.get(step.designTemplateId))
        || designCtx.sequenceTemplateShell;
      const designedBody = renderSequenceStepBody({
        ctx: designCtx,
        stepDesignTemplateId: step.designTemplateId,
        bodyHtml: contentBody,
        signatureHtml: signatureContentHtml(signature),
      });
      const bodyWithSignature = stepShell?.includes("{{signature}}")
        ? designedBody
        : withSignature(designedBody, signature);
      values.push({
        leadId: lead.id,
        templateId: null,
        batchId,
        toAddress: lead.email!,
        fromAddress: senderConfig.from ?? fromAddress(product),
        subject: interpolate(variantContent.subject, lead),
        body: appendUnsubscribeFooter(
          bodyWithSignature,
          token,
          {
            productName: senderConfig.productName ?? product?.name,
            footerText: senderConfig.footerText ?? product?.unsubscribeFooterText,
            senderLabel: senderConfig.senderLabel ?? product?.unsubscribeSenderLabel,
            supportEmail: senderConfig.supportEmail ?? product?.unsubscribeSupportEmail,
          },
        ),
        unsubscribeToken: token,
        status: "scheduled" as const,
        scheduledFor: new Date(leadStart.getTime() + step.delayDays * 86_400_000),
        sequenceId,
        sequenceStepId: step.id,
        abVariant,
        scheduledByUserId: senderUserId ?? null,
      });
    }
  }

  return {
    values,
    result: {
      batchId,
      enrolled: eligibleLeads.length,
      scheduled: values.length,
      noEmailSkipped: requestedLeadIds.length - emailLeads.length,
      unsubscribedSkipped: emailLeads.length - eligibleLeads.length,
      stepsPerLead: steps.length,
    },
  };
}

async function scheduleSequence(
  sequenceId: number,
  requestedLeadIds: number[],
  startDate: Date,
  batchId = randomUUID(),
  senderUserId?: string | null,
) {
  const prepared = await prepareSequenceSchedule(sequenceId, requestedLeadIds, startDate, batchId, senderUserId);
  if (prepared.values.length) await db.insert(emailSendsTable).values(prepared.values);
  return prepared.result;
}

router.get("/email-sequences", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const productId = typeof req.query.productId === "string" ? Number.parseInt(req.query.productId, 10) : null;
  if (productId && Number.isInteger(productId) && !await canAccessProduct(req, productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }
  const unassigned = req.query.unassigned === "true";
  const where = unassigned
    ? sql`${emailSequencesTable.productId} IS NULL`
    : productId && Number.isInteger(productId)
      ? eq(emailSequencesTable.productId, productId)
      : undefined;
  const sequences = await db
    .select({
      id: emailSequencesTable.id,
      name: emailSequencesTable.name,
      description: emailSequencesTable.description,
      productId: emailSequencesTable.productId,
      logoAssetId: emailSequencesTable.logoAssetId,
      designTemplateId: emailSequencesTable.designTemplateId,
      productName: productsTable.name,
      createdAt: emailSequencesTable.createdAt,
      updatedAt: emailSequencesTable.updatedAt,
      stepCount: sql<number>`cast(count(${emailSequenceStepsTable.id}) as int)`,
    })
    .from(emailSequencesTable)
    .leftJoin(productsTable, eq(emailSequencesTable.productId, productsTable.id))
    .leftJoin(emailSequenceStepsTable, eq(emailSequenceStepsTable.sequenceId, emailSequencesTable.id))
    .where(where)
    .groupBy(emailSequencesTable.id, productsTable.name)
    .orderBy(asc(emailSequencesTable.createdAt));
  const visibleSequences = req.user!.role === "owner"
    ? sequences
    : (await Promise.all(sequences.map(async (sequence) =>
      !sequence.productId || await canAccessProduct(req, sequence.productId) ? sequence : null,
    ))).filter((sequence): sequence is (typeof sequences)[number] => Boolean(sequence));
  res.json(visibleSequences);
});

router.post("/email-sequences/generate", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const parsed = generateSequenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid sequence request" });
    return;
  }
  const { productId, instruction, emailCount, delaysBetweenEmails } = parsed.data;
  if (!await canAccessProduct(req, productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const productContext = [
    `Product: ${product.name}`,
    product.tagline ? `Tagline: ${product.tagline}` : null,
    product.description ? `Description: ${product.description}` : null,
    product.valueProp ? `Value proposition: ${product.valueProp}` : null,
    product.icp ? `Ideal customer: ${product.icp}` : null,
    product.targetMarket ? `Target market: ${product.targetMarket}` : null,
  ].filter(Boolean).join("\n");
  const waits = delaysBetweenEmails.map((days, index) => `Email ${index + 2}: wait ${days} day${days === 1 ? "" : "s"} after the previous email`).join("\n");
  const prompt = `Create a ${emailCount}-email B2B outreach sequence.

PRODUCT CONTEXT:
${productContext}

USER INSTRUCTION:
${instruction}

CADENCE:
Email 1 sends immediately.
${waits || "Only one email."}

Write human, concise outreach. Avoid corporate filler and do not use bullets in the email bodies. Use at most one clear CTA per email. You may use {{firstName}}, {{company}}, {{title}}, {{lastName}}, and {{email}} as merge fields.

BODY FORMAT (critical):
- Write each email body as plain text with clear paragraph breaks.
- Separate EVERY paragraph with a blank line (use \\n\\n between paragraphs).
- Keep paragraphs short (1–3 sentences each). Never return one long run-on block.
- Put greeting, problem, value, CTA, and sign-off in separate paragraphs when present.
- Example shape:
Hi {{firstName}},

Quick question about {{company}}.

Here is the idea in one short paragraph.

Here is the CTA link on its own line:
https://example.com

Best,
Name

Return only JSON:
{"name":"sequence name","description":"short optional description","steps":[{"name":"optional step name","subject":"subject","body":"plain-text email body with blank lines between paragraphs"}]}`;

  try {
    const { json } = await runJson(
      "You are an experienced B2B sales copywriter. Return only valid JSON matching the requested shape. Email bodies MUST include blank lines between paragraphs.",
      prompt,
    );
    const generated = generatedSequenceSchema.safeParse(json);
    if (!generated.success || generated.data.steps.length !== emailCount) {
      req.log.warn({ emailCount }, "AI returned an invalid sequence draft");
      res.status(502).json({ error: "The AI returned an incomplete sequence. Please try again." });
      return;
    }
    let day = 0;
    res.json({
      name: generated.data.name,
      description: generated.data.description ?? null,
      steps: generated.data.steps.map((step, index) => {
        if (index > 0) day += delaysBetweenEmails[index - 1];
        return {
          ...step,
          body: emailBodyToHtml(step.body),
          delayDays: day,
        };
      }),
    });
  } catch (error) {
    req.log.error({ error }, "Sequence generation failed");
    res.status(500).json({ error: "Could not generate the sequence. Please try again." });
  }
});

// Create or replace a sequence and every step in one transaction.
router.post("/email-sequences/save", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const parsed = fullSequenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid sequence" });
    return;
  }
  const data = parsed.data;
  if (data.sequenceId) {
    const existing = await getAccessibleSequence(req, data.sequenceId);
    if (!existing) {
      res.status(404).json({ error: "Sequence not found or not accessible" });
      return;
    }
  }
  if (data.productId && !await canAccessProduct(req, data.productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      let sequenceId = data.sequenceId;
      if (sequenceId) {
        const [updated] = await tx
          .update(emailSequencesTable)
          .set({
            name: data.name,
            description: data.description ?? null,
            productId: data.productId ?? null,
            logoAssetId: data.logoAssetId === undefined ? undefined : data.logoAssetId,
            designTemplateId: data.designTemplateId === undefined ? undefined : data.designTemplateId,
          })
          .where(eq(emailSequencesTable.id, sequenceId))
          .returning();
        if (!updated) throw new Error("Sequence not found");
        await tx.delete(emailSequenceStepsTable).where(eq(emailSequenceStepsTable.sequenceId, sequenceId));
      } else {
        const [created] = await tx
          .insert(emailSequencesTable)
          .values({
            name: data.name,
            description: data.description ?? null,
            productId: data.productId ?? null,
            logoAssetId: data.logoAssetId ?? null,
            designTemplateId: data.designTemplateId ?? null,
          })
          .returning();
        sequenceId = created.id;
      }
      const stepRows = [];
      for (const step of data.steps) {
        const body = await bodyCacheFromStep(step, data.productId ?? null);
        stepRows.push({
          sequenceId: sequenceId!,
          position: stepRows.length + 1,
          delayDays: step.delayDays,
          name: step.name ?? null,
          subject: step.subject,
          body: body || step.body || "<p></p>",
          sectionsJson: step.sectionsJson ?? null,
          designTemplateId: step.designTemplateId ?? null,
          abTestEnabled: step.abTestEnabled ?? false,
          abTestSplitPercent: step.abTestSplitPercent ?? 50,
          subjectVariantB: step.subjectVariantB ?? null,
          bodyVariantB: step.bodyVariantB ?? null,
          sectionsJsonVariantB: step.sectionsJsonVariantB ?? null,
          resendIfUnopened: step.resendIfUnopened ?? false,
          resendAfterHours: step.resendAfterHours ?? 48,
        });
      }
      const steps = await tx
        .insert(emailSequenceStepsTable)
        .values(stepRows)
        .returning();
      const [sequence] = await tx.select().from(emailSequencesTable).where(eq(emailSequencesTable.id, sequenceId!));
      return { sequence, steps };
    });
    res.status(data.sequenceId ? 200 : 201).json(result);
  } catch (error) {
    req.log.error({ error }, "Full sequence save failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not save the sequence" });
  }
});

router.post("/email-sequences", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (Number.isInteger(req.body.productId) && !await canAccessProduct(req, req.body.productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }
  const [sequence] = await db
    .insert(emailSequencesTable)
    .values({
      name,
      description: typeof req.body.description === "string" ? req.body.description.trim() || null : null,
      productId: Number.isInteger(req.body.productId) ? req.body.productId : null,
    })
    .returning();
  res.status(201).json(sequence);
});

router.patch("/email-sequences/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  if (!sequenceId) {
    res.status(400).json({ error: "Invalid sequence" });
    return;
  }
  const existing = await getAccessibleSequence(req, sequenceId);
  if (!existing) {
    res.status(404).json({ error: "Sequence not found or not accessible" });
    return;
  }
  if (Number.isInteger(req.body.productId) && !await canAccessProduct(req, req.body.productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }
  const patch: Partial<typeof emailSequencesTable.$inferInsert> = {};
  if (typeof req.body.name === "string") patch.name = req.body.name.trim();
  if (typeof req.body.description === "string" || req.body.description === null) patch.description = req.body.description?.trim() || null;
  if (Number.isInteger(req.body.productId) || req.body.productId === null) patch.productId = req.body.productId;
  if (Number.isInteger(req.body.logoAssetId) || req.body.logoAssetId === null) patch.logoAssetId = req.body.logoAssetId;
  if (Number.isInteger(req.body.designTemplateId) || req.body.designTemplateId === null) patch.designTemplateId = req.body.designTemplateId;
  const [sequence] = await db.update(emailSequencesTable).set(patch).where(eq(emailSequencesTable.id, sequenceId)).returning();
  if (!sequence) {
    res.status(404).json({ error: "Sequence not found" });
    return;
  }
  res.json(sequence);
});

router.delete("/email-sequences/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  if (!sequenceId) {
    res.status(400).json({ error: "Invalid sequence" });
    return;
  }
  const sequence = await getAccessibleSequence(req, sequenceId);
  if (!sequence) {
    res.status(404).json({ error: "Sequence not found or not accessible" });
    return;
  }
  await db.delete(emailSequencesTable).where(eq(emailSequencesTable.id, sequenceId));
  res.status(204).end();
});

router.get("/email-sequences/:id/steps", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  if (!sequenceId) {
    res.status(400).json({ error: "Invalid sequence" });
    return;
  }
  const sequence = await getAccessibleSequence(req, sequenceId);
  if (!sequence) {
    res.status(404).json({ error: "Sequence not found or not accessible" });
    return;
  }
  const steps = await db.select().from(emailSequenceStepsTable)
    .where(eq(emailSequenceStepsTable.sequenceId, sequenceId))
    .orderBy(asc(emailSequenceStepsTable.position));
  res.json(steps);
});

router.post("/email-sequences/:id/steps", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  const parsed = stepInputSchema.safeParse(req.body);
  if (!sequenceId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid sequence" : parsed.error.issues[0]?.message });
    return;
  }
  const sequence = await getAccessibleSequence(req, sequenceId);
  if (!sequence) {
    res.status(404).json({ error: "Sequence not found or not accessible" });
    return;
  }
  const body = await bodyCacheFromStep(parsed.data, sequence.productId);
  const [maxPosition] = await db.select({ max: sql<number>`coalesce(max(${emailSequenceStepsTable.position}), 0)::int` })
    .from(emailSequenceStepsTable).where(eq(emailSequenceStepsTable.sequenceId, sequenceId));
  const [step] = await db.insert(emailSequenceStepsTable).values({
    sequenceId,
    position: (maxPosition?.max ?? 0) + 1,
    delayDays: parsed.data.delayDays,
    name: parsed.data.name ?? null,
    subject: parsed.data.subject,
    body: body || parsed.data.body || "<p></p>",
    sectionsJson: parsed.data.sectionsJson ?? null,
    designTemplateId: parsed.data.designTemplateId ?? null,
  }).returning();
  res.status(201).json(step);
});

router.patch("/email-sequences/:id/steps/:stepId", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  const stepId = parseId(req.params.stepId);
  const parsed = stepInputSchema.partial().safeParse(req.body);
  if (!sequenceId || !stepId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid sequence step" : parsed.error.issues[0]?.message });
    return;
  }
  const sequence = await getAccessibleSequence(req, sequenceId);
  if (!sequence) {
    res.status(404).json({ error: "Sequence not found or not accessible" });
    return;
  }
  const [existing] = await db.select().from(emailSequenceStepsTable)
    .where(and(eq(emailSequenceStepsTable.id, stepId), eq(emailSequenceStepsTable.sequenceId, sequenceId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Step not found" });
    return;
  }
  const merged = { ...existing, ...parsed.data };
  const patch: Partial<typeof emailSequenceStepsTable.$inferInsert> = { ...parsed.data };
  if (parsed.data.sectionsJson !== undefined || parsed.data.body !== undefined) {
    patch.body = await bodyCacheFromStep(merged, sequence.productId);
  }
  const [step] = await db.update(emailSequenceStepsTable).set(patch)
    .where(and(eq(emailSequenceStepsTable.id, stepId), eq(emailSequenceStepsTable.sequenceId, sequenceId)))
    .returning();
  res.json(step);
});

router.delete("/email-sequences/:id/steps/:stepId", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  const stepId = parseId(req.params.stepId);
  if (!sequenceId || !stepId) {
    res.status(400).json({ error: "Invalid sequence step" });
    return;
  }
  if (!await getAccessibleSequence(req, sequenceId)) {
    res.status(404).json({ error: "Sequence not found or not accessible" });
    return;
  }
  const [deleted] = await db.delete(emailSequenceStepsTable)
    .where(and(eq(emailSequenceStepsTable.id, stepId), eq(emailSequenceStepsTable.sequenceId, sequenceId)))
    .returning({ position: emailSequenceStepsTable.position });
  if (deleted) {
    await db.execute(sql`UPDATE email_sequence_steps SET position = position - 1 WHERE sequence_id = ${sequenceId} AND position > ${deleted.position}`);
  }
  res.status(204).end();
});

router.post("/email-sequences/:id/steps/reorder", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.filter((id: unknown): id is number => Number.isInteger(id)) : [];
  if (!sequenceId || !orderedIds.length) {
    res.status(400).json({ error: "A sequence and ordered step IDs are required" });
    return;
  }
  if (!await getAccessibleSequence(req, sequenceId)) {
    res.status(404).json({ error: "Sequence not found or not accessible" });
    return;
  }
  await db.transaction(async (tx) => {
    for (const [index, stepId] of orderedIds.entries()) {
      await tx.update(emailSequenceStepsTable).set({ position: index + 1 })
        .where(and(eq(emailSequenceStepsTable.id, stepId), eq(emailSequenceStepsTable.sequenceId, sequenceId)));
    }
  });
  const steps = await db.select().from(emailSequenceStepsTable)
    .where(eq(emailSequenceStepsTable.sequenceId, sequenceId))
    .orderBy(asc(emailSequenceStepsTable.position));
  res.json(steps);
});

router.post("/email-sequences/:id/enroll", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  const leadIds: number[] = Array.isArray(req.body?.leadIds)
    ? [...new Set((req.body.leadIds as unknown[]).filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0))]
    : [];
  const startAt = req.body?.enrollDate ? new Date(req.body.enrollDate) : new Date();
  if (!sequenceId || !leadIds.length || Number.isNaN(startAt.getTime())) {
    res.status(400).json({ error: "A sequence, contacts, and valid enrollment date are required" });
    return;
  }
  const sequence = await getAccessibleSequence(req, sequenceId);
  if (!sequence) {
    res.status(404).json({ error: "Sequence not found or not accessible" });
    return;
  }
  const permittedLeadIds = await visibleLeadIds(req, leadIds);
  if (permittedLeadIds.length !== leadIds.length) {
    res.status(403).json({ error: "You can only enroll contacts you are allowed to view" });
    return;
  }
  if (!await leadProductsAreAccessible(req, permittedLeadIds, sequence.productId)) {
    res.status(403).json({ error: "You do not have access to every contact product, or the contacts do not match this sequence product" });
    return;
  }
  try {
    const result = await scheduleSequence(sequenceId, permittedLeadIds, startAt, randomUUID(), req.user!.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not enroll contacts" });
  }
});

router.post("/email-sequences/:id/launch", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const sequenceId = parseId(req.params.id);
  const contactListId = Number.isInteger(req.body?.contactListId) ? req.body.contactListId : null;
  const tagIds = parseAudienceTagIds(req.body?.tagIds);
  const tagMatch: "any" | "all" = req.body?.tagMatch === "all" ? "all" : "any";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const startValidation = validateScheduledFor(req.body?.startAt);
  if (!sequenceId || !name || name.length > 160 || (!!contactListId === !!tagIds)) {
    res.status(400).json({ error: "Campaign name, exactly one audience, and start date are required" });
    return;
  }
  if (!startValidation.ok) {
    res.status(startValidation.status).json({ error: startValidation.error });
    return;
  }
  const startAt = startValidation.date;
  const sequence = await getAccessibleSequence(req, sequenceId);
  if (!sequence) {
    res.status(404).json({ error: "Sequence not found" });
    return;
  }
  try {
    let leadIds: number[] = [];
    let requiredProductId = sequence.productId;
    if (contactListId) {
      const [list] = await db.select().from(contactListsTable).where(eq(contactListsTable.id, contactListId)).limit(1);
      if (!list) throw new Error("Contact list not found");
      if ((req.user as { role?: string }).role !== "owner" && list.createdByUserId !== req.user!.id) {
        res.status(403).json({ error: "You cannot use this contact list" });
        return;
      }
      if (list.productId && !await canAccessProduct(req, list.productId)) {
        res.status(403).json({ error: "You do not have access to this contact list's product" });
        return;
      }
      if (sequence.productId && list.productId && sequence.productId !== list.productId) {
        res.status(400).json({ error: "Choose a contact list for the same product as this sequence" });
        return;
      }
      const memberRows = await db.select({ leadId: contactListMembersTable.leadId, productId: leadsTable.productId })
        .from(contactListMembersTable)
        .innerJoin(leadsTable, eq(contactListMembersTable.leadId, leadsTable.id))
        .where(eq(contactListMembersTable.listId, contactListId));
      leadIds = memberRows.map((member) => member.leadId);
      requiredProductId = sequence.productId ?? list.productId;
      if (!leadIds.length) throw new Error("This contact list has no members");
      if (requiredProductId && memberRows.some((member) => member.productId !== requiredProductId)) {
        throw new Error("Every contact in a product campaign must belong to the campaign product");
      }
    } else {
      leadIds = await resolveTagAudienceLeadIds(req, tagIds!, tagMatch, requiredProductId);
      if (!leadIds.length) throw new Error("No accessible contacts match those tags");
    }
    if (!await leadProductsAreAccessible(req, leadIds, requiredProductId)) {
      res.status(403).json({ error: "You do not have access to every contact product, or the contacts do not match this campaign product" });
      return;
    }
    const permittedLeadIds = await visibleLeadIds(req, leadIds);
    if (permittedLeadIds.length !== leadIds.length) {
      res.status(403).json({ error: "You can only launch campaigns to contacts you are allowed to view" });
      return;
    }
    const batchId = randomUUID();
    const prepared = await prepareSequenceSchedule(sequenceId, permittedLeadIds, startAt, batchId, req.user!.id);
    await db.transaction(async (tx) => {
      if (prepared.values.length) await tx.insert(emailSendsTable).values(prepared.values);
      await tx.insert(emailCampaignsTable).values({
        batchId,
        name,
        sequenceId,
        contactListId: contactListId ?? null,
        createdByUserId: req.user!.id,
        startsAt: startAt,
      });
    });
    res.status(201).json({ ...prepared.result, name, contactListId, tagIds: tagIds ?? undefined, sequenceId });
  } catch (error) {
    req.log.error({ error, sequenceId, contactListId }, "Campaign launch failed");
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not launch campaign" });
  }
});

router.post("/products/:productId/email-sequences/send-test", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  if (!await canAccessProduct(req, productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }

  const parsed = sendTestEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const payload = parsed.data;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const variant = payload.variant === "B" && payload.subjectVariantB?.trim() ? "B" : "A";
  const variantContent = stepVariantContent(
    {
      subject: payload.subject,
      body: payload.body ?? "",
      sectionsJson: payload.sectionsJson,
      subjectVariantB: payload.subjectVariantB,
      bodyVariantB: payload.bodyVariantB,
    },
    variant,
  );

  const designCtx = await loadSequenceDesignContext({
    productId,
    brandName: product.name,
    sequenceLogoAssetId: payload.logoAssetId ?? null,
    sequenceDesignTemplateId: payload.sequenceDesignTemplateId ?? null,
    steps: [{ id: 0, designTemplateId: payload.designTemplateId ?? null }],
  });

  const sectionBrand = await loadBrandForProduct(productId);
  const origin = appPublicUrl();
  const stepSections = variantContent.sections;
  const rawContent = stepSections?.length
    ? renderSectionsBodyFragment(stepSections, sectionBrand, origin)
    : variantContent.body;
  const contentBody = interpolate(rawContent, { ...TEST_MERGE_LEAD, email: payload.to });

  const senderConfig = await resolveSenderEmailConfig(productId, req.user!.id);
  const signature = senderConfig.signature ?? product.emailSignature;
  const stepShell = resolveStepShell(designCtx, payload.designTemplateId);
  const designedBody = renderSequenceStepBody({
    ctx: designCtx,
    stepDesignTemplateId: payload.designTemplateId,
    bodyHtml: `${TEST_EMAIL_BANNER}${contentBody}`,
    signatureHtml: signatureContentHtml(signature),
  });
  const html = stepShell?.includes("{{signature}}")
    ? designedBody
    : withSignature(designedBody, signature);

  const subject = interpolate(variantContent.subject, { ...TEST_MERGE_LEAD, email: payload.to });
  const from = senderConfig.from ?? fromAddress(product);
  if (!from) {
    res.status(400).json({ error: "Configure a from email for this product before sending test emails" });
    return;
  }

  const result = await sendEmail({
    to: payload.to,
    from,
    subject: `[TEST] ${subject}`,
    html,
  });

  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }

  res.json({ ok: true, id: result.id });
});

export default router;