import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { leadsTable, productsTable, emailSendsTable, leadTagsTable, leadTagAssignmentsTable } from "@workspace/db/schema";
import { eq, ilike, or, and, inArray, sql } from "drizzle-orm";
import { requireOwner } from "../middlewares/requireOwner";
import { openai } from "@workspace/integrations-openai-ai-server";
import { parseCSV, mapApolloRow, runImportApollo } from "../lib/importApolloHelpers";

const router: IRouter = Router();

type TagSummary = { id: number; name: string };

function parseTagIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return value === undefined ? [] : null;
  const ids = [...new Set(value)];
  return ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0) ? ids as number[] : null;
}

function normalizedTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

async function ensureTagsExist(tagIds: number[]): Promise<boolean> {
  if (!tagIds.length) return true;
  const found = await db.select({ id: leadTagsTable.id }).from(leadTagsTable).where(inArray(leadTagsTable.id, tagIds));
  return found.length === tagIds.length;
}

async function addTagsToLead(leadId: number, tagIds: number[]): Promise<void> {
  if (!tagIds.length) return;
  await db.insert(leadTagAssignmentsTable)
    .values(tagIds.map((tagId) => ({ leadId, tagId })))
    .onConflictDoNothing();
}

async function attachTags<T extends { id: number }>(leads: T[]): Promise<Array<T & { tags: TagSummary[] }>> {
  if (!leads.length) return [];
  const rows = await db
    .select({
      leadId: leadTagAssignmentsTable.leadId,
      id: leadTagsTable.id,
      name: leadTagsTable.name,
    })
    .from(leadTagAssignmentsTable)
    .innerJoin(leadTagsTable, eq(leadTagAssignmentsTable.tagId, leadTagsTable.id))
    .where(inArray(leadTagAssignmentsTable.leadId, leads.map((lead) => lead.id)))
    .orderBy(leadTagsTable.name);
  const tagsByLead = new Map<number, TagSummary[]>();
  for (const row of rows) {
    tagsByLead.set(row.leadId, [...(tagsByLead.get(row.leadId) ?? []), { id: row.id, name: row.name }]);
  }
  return leads.map((lead) => ({ ...lead, tags: tagsByLead.get(lead.id) ?? [] }));
}

// ── GET /api/lead-tags ─────────────────────────────────────────────────────
router.get("/lead-tags", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const productId = typeof req.query.productId === "string" ? Number(req.query.productId) : null;
  const conditions = [];
  if (req.user.role !== "owner") conditions.push(eq(leadsTable.assignedToUserId, req.user.id));
  if (productId && Number.isInteger(productId) && productId > 0) conditions.push(eq(leadsTable.productId, productId));
  const tags = await db
    .select({
      id: leadTagsTable.id,
      name: leadTagsTable.name,
      leadCount: sql<number>`count(distinct ${leadTagAssignmentsTable.leadId})`.mapWith(Number),
    })
    .from(leadTagsTable)
    .leftJoin(leadTagAssignmentsTable, eq(leadTagsTable.id, leadTagAssignmentsTable.tagId))
    .leftJoin(leadsTable, eq(leadTagAssignmentsTable.leadId, leadsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(leadTagsTable.id, leadTagsTable.name)
    .orderBy(leadTagsTable.name);
  res.json(tags);
});

// ── POST /api/lead-tags ────────────────────────────────────────────────────
router.post("/lead-tags", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 64) {
    res.status(400).json({ error: "Tag name must be between 1 and 64 characters" });
    return;
  }
  const normalizedName = normalizedTagName(name);
  const [existing] = await db.select().from(leadTagsTable).where(eq(leadTagsTable.normalizedName, normalizedName)).limit(1);
  if (existing) {
    res.json(existing);
    return;
  }
  const [tag] = await db.insert(leadTagsTable).values({ name, normalizedName }).returning();
  res.status(201).json(tag);
});

// ── DELETE /api/lead-tags/:id ───────────────────────────────────────────────
router.delete("/lead-tags/:id", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid tag id" }); return; }
  const [deleted] = await db.delete(leadTagsTable).where(eq(leadTagsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Tag not found" }); return; }
  res.status(204).end();
});

// ── GET /api/leads ─────────────────────────────────────────────────────────
router.get("/leads", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { status, search, productId, leadType, tagIds, tagMatch } = req.query as {
    status?: string; search?: string; productId?: string; leadType?: string; tagIds?: string; tagMatch?: string;
  };

  const conditions = [];

  // Members see only leads assigned to them
  if (req.user.role !== "owner") {
    conditions.push(eq(leadsTable.assignedToUserId, req.user.id));
  }

  if (status && status !== "all") {
    conditions.push(eq(leadsTable.status, status));
  }

  if (productId && productId !== "all") {
    const pid = parseInt(productId, 10);
    if (!isNaN(pid)) conditions.push(eq(leadsTable.productId, pid));
  }

  if (leadType === "end_user" || leadType === "reseller") {
    conditions.push(eq(leadsTable.leadType, leadType));
  }

  const selectedTagIds = (tagIds ?? "").split(",")
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (selectedTagIds.length) {
    const uniqueTagIds = [...new Set(selectedTagIds)];
    if (tagMatch === "all") {
      conditions.push(sql`(
        SELECT count(distinct ${leadTagAssignmentsTable.tagId})
        FROM ${leadTagAssignmentsTable}
        WHERE ${eq(leadTagAssignmentsTable.leadId, leadsTable.id)}
          AND ${inArray(leadTagAssignmentsTable.tagId, uniqueTagIds)}
      ) = ${uniqueTagIds.length}`);
    } else {
      conditions.push(sql`EXISTS (
        SELECT 1
        FROM ${leadTagAssignmentsTable}
        WHERE ${eq(leadTagAssignmentsTable.leadId, leadsTable.id)}
          AND ${inArray(leadTagAssignmentsTable.tagId, uniqueTagIds)}
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
      )
    );
  }

  const leads = await db
    .select()
    .from(leadsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(leadsTable.createdAt);

  res.json(await attachTags(leads));
});

// ── POST /api/leads ────────────────────────────────────────────────────────
router.post("/leads", requireOwner, async (req: Request, res: Response) => {
  const {
    firstName, lastName, email, company, title, phone, linkedinUrl,
    companyLinkedinUrl, instagramUrl, facebookUrl, tiktokUrl, address,
    notes, productId, leadType, tagIds: rawTagIds,
  } = req.body as {
    firstName?: string; lastName?: string; email?: string; company?: string;
    title?: string; phone?: string; linkedinUrl?: string;
    companyLinkedinUrl?: string; instagramUrl?: string; facebookUrl?: string;
    tiktokUrl?: string; address?: string;
    notes?: string; productId?: number | null;
    leadType?: "end_user" | "reseller" | null; tagIds?: unknown;
  };
  const tagIds = parseTagIds(rawTagIds);
  if (!tagIds || !await ensureTagsExist(tagIds)) {
    res.status(400).json({ error: "One or more selected tags do not exist" });
    return;
  }

  const [lead] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(leadsTable).values({
    firstName: firstName ?? "",
    lastName:  lastName  ?? "",
    email:     email     || null,
    company:   company   || null,
    title:     title     || null,
    phone:     phone     || null,
    linkedinUrl:        linkedinUrl        || null,
    companyLinkedinUrl: companyLinkedinUrl || null,
    instagramUrl:       instagramUrl       || null,
    facebookUrl:        facebookUrl        || null,
    tiktokUrl:          tiktokUrl          || null,
    address:            address            || null,
    notes:              notes              || null,
    productId:          productId ?? null,
    leadType:           leadType === "reseller" ? "reseller" : leadType === "end_user" ? "end_user" : undefined,
    status: "new",
    }).returning();
    if (tagIds.length) {
      await tx.insert(leadTagAssignmentsTable).values(tagIds.map((tagId) => ({ leadId: created.id, tagId })));
    }
    return [created];
  });

  res.status(201).json((await attachTags([lead]))[0]);
});

// ── POST /api/leads/import-apollo ──────────────────────────────────────────
// Streams Server-Sent Events so the client can show a live progress bar.
// Events:
//   data: {"type":"progress","processed":N,"total":M}
//   data: {"type":"done","imported":N,"updated":M}
//   data: {"type":"error","message":"..."}
router.post("/leads/import-apollo", requireOwner, async (req: Request, res: Response) => {
  const { csv, productId, leadType, tagIds: rawTagIds } = req.body as {
    csv?: string; productId?: number | null; leadType?: "end_user" | "reseller"; tagIds?: unknown;
  };
  const lt = leadType === "reseller" ? "reseller" : "end_user";
  if (!csv || typeof csv !== "string") {
    res.status(400).json({ error: "csv string required" });
    return;
  }

  const rows = parseCSV(csv);
  if (!rows.length) {
    res.status(400).json({ error: "No rows found in CSV" });
    return;
  }

  const mapped = rows.map(mapApolloRow).filter(r => r.firstName || r.lastName || r.email);
  const total = mapped.length;
  const pid = typeof productId === "number" ? productId : null;
  const tagIds = parseTagIds(rawTagIds);
  if (!tagIds || !await ensureTagsExist(tagIds)) {
    res.status(400).json({ error: "One or more selected tags do not exist" });
    return;
  }

  // ── Set up SSE stream ─────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runImportApollo(mapped, {
      upsertByApolloId: async (data) => {
        const rowData = { ...data, ...(pid !== null ? { productId: pid } : {}), leadType: lt };
        const existing = await db
          .select()
          .from(leadsTable)
          .where(eq(leadsTable.apolloId, data.apolloId!))
          .limit(1);
        if (existing.length) {
          await db.update(leadsTable).set(rowData).where(eq(leadsTable.apolloId, data.apolloId!));
          await addTagsToLead(existing[0].id, tagIds);
          return { isNew: false };
        }
        const [created] = await db.insert(leadsTable).values(rowData).returning({ id: leadsTable.id });
        await addTagsToLead(created.id, tagIds);
        return { isNew: true };
      },

      upsertByEmail: async (data) => {
        const rowData = { ...data, ...(pid !== null ? { productId: pid } : {}), leadType: lt };
        const existing = await db
          .select()
          .from(leadsTable)
          .where(eq(leadsTable.email, data.email!))
          .limit(1);
        if (existing.length) {
          await db.update(leadsTable).set(rowData).where(eq(leadsTable.email, data.email!));
          await addTagsToLead(existing[0].id, tagIds);
          return { isNew: false };
        }
        const [created] = await db.insert(leadsTable).values(rowData).returning({ id: leadsTable.id });
        await addTagsToLead(created.id, tagIds);
        return { isNew: true };
      },

      batchInsert: async (rows) => {
        const batch = rows.map(data => ({
          ...data,
          ...(pid !== null ? { productId: pid } : {}),
          leadType: lt,
        }));
        const inserted = await db.insert(leadsTable).values(batch).returning({ id: leadsTable.id });
        if (tagIds.length && inserted.length) {
          await db.insert(leadTagAssignmentsTable)
            .values(inserted.flatMap((lead) => tagIds.map((tagId) => ({ leadId: lead.id, tagId }))));
        }
        return inserted.length;
      },

      onProgress: (processed) => {
        sendEvent({ type: "progress", processed, total });
      },
    });

    sendEvent({ type: "done", imported: result.imported, updated: result.updated });
  } catch (err) {
    sendEvent({ type: "error", message: String(err) });
  } finally {
    res.end();
  }
});

// ── PATCH /api/leads/bulk-assign ──────────────────────────────────────────
router.patch("/leads/bulk-assign", requireOwner, async (req: Request, res: Response) => {
  const { leadIds, assignedToUserId } = req.body as {
    leadIds: number[];
    assignedToUserId: string | null;
  };

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    res.status(400).json({ error: "leadIds must be a non-empty array" });
    return;
  }

  await db
    .update(leadsTable)
    .set({ assignedToUserId: assignedToUserId || null })
    .where(inArray(leadsTable.id, leadIds));

  res.json({ updated: leadIds.length });
});

// ── PATCH /api/leads/bulk-tags ─────────────────────────────────────────────
router.patch("/leads/bulk-tags", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const leadIds = parseTagIds(req.body?.leadIds);
  const tagIds = parseTagIds(req.body?.tagIds);
  if (!leadIds?.length || !tagIds?.length) {
    res.status(400).json({ error: "leadIds and tagIds must be non-empty arrays" });
    return;
  }
  if (!await ensureTagsExist(tagIds)) {
    res.status(400).json({ error: "One or more selected tags do not exist" });
    return;
  }
  const leads = await db.select({ id: leadsTable.id }).from(leadsTable).where(inArray(leadsTable.id, leadIds));
  if (leads.length !== leadIds.length) {
    res.status(404).json({ error: "One or more leads do not exist" });
    return;
  }
  await db.insert(leadTagAssignmentsTable)
    .values(leadIds.flatMap((leadId) => tagIds.map((tagId) => ({ leadId, tagId }))))
    .onConflictDoNothing();
  res.json({ updated: leadIds.length });
});

// ── POST /api/leads/bulk-delete ────────────────────────────────────────────
router.post("/leads/bulk-delete", requireOwner, async (req: Request, res: Response) => {
  const leadIds = parseTagIds(req.body?.leadIds);
  if (!leadIds?.length) {
    res.status(400).json({ error: "leadIds must be a non-empty array" });
    return;
  }

  // Cancel scheduled emails so they don't fire after deletion.
  await db
    .update(emailSendsTable)
    .set({ status: "cancelled" })
    .where(
      and(
        inArray(emailSendsTable.leadId, leadIds),
        eq(emailSendsTable.status, "scheduled"),
      ),
    );

  await db.delete(leadsTable).where(inArray(leadsTable.id, leadIds));
  res.json({ deleted: leadIds.length });
});

// ── PATCH /api/leads/:id ───────────────────────────────────────────────────
router.patch("/leads/:id", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }

  const {
    firstName, lastName, email, company, title, phone,
    linkedinUrl, companyLinkedinUrl, instagramUrl, facebookUrl, tiktokUrl, address,
    notes, status,
    lastActionType, lastActionNote, logAction,
    assignedToUserId, leadType, tagIds: rawTagIds,
  } = req.body as {
    firstName?: string; lastName?: string; email?: string; company?: string;
    title?: string; phone?: string; linkedinUrl?: string;
    companyLinkedinUrl?: string; instagramUrl?: string; facebookUrl?: string;
    tiktokUrl?: string; address?: string;
    notes?: string; status?: string; lastActionType?: string; lastActionNote?: string;
    logAction?: boolean; assignedToUserId?: string | null;
    leadType?: "end_user" | "reseller" | null; tagIds?: unknown;
  };

  const patch: Partial<typeof leadsTable.$inferInsert> = {};

  // Members: only allowed to log actions on their assigned leads
  if (req.user.role !== "owner") {
    const [current] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
    if (!current || current.assignedToUserId !== req.user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (logAction) {
      patch.lastActionType = lastActionType || null;
      patch.lastActionNote = lastActionNote || null;
      patch.lastActionAt   = new Date();
      if (current.status === "new") patch.status = "contacted";
    }
    const [updated] = await db
      .update(leadsTable)
      .set(patch)
      .where(eq(leadsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "not found" }); return; }
    res.json(updated);
    return;
  }

  const tagIds = parseTagIds(rawTagIds);
  if (!tagIds || !await ensureTagsExist(tagIds)) {
    res.status(400).json({ error: "One or more selected tags do not exist" });
    return;
  }

  if (firstName        !== undefined) patch.firstName        = firstName;
  if (lastName         !== undefined) patch.lastName         = lastName;
  if (email            !== undefined) patch.email            = email || null;
  if (company          !== undefined) patch.company          = company || null;
  if (title            !== undefined) patch.title            = title || null;
  if (phone            !== undefined) patch.phone            = phone || null;
  if (linkedinUrl      !== undefined) patch.linkedinUrl      = linkedinUrl || null;
  if (companyLinkedinUrl !== undefined) patch.companyLinkedinUrl = companyLinkedinUrl || null;
  if (instagramUrl     !== undefined) patch.instagramUrl     = instagramUrl || null;
  if (facebookUrl      !== undefined) patch.facebookUrl      = facebookUrl || null;
  if (tiktokUrl        !== undefined) patch.tiktokUrl        = tiktokUrl || null;
  if (address          !== undefined) patch.address          = address || null;
  if (notes            !== undefined) patch.notes            = notes || null;
  if (status           !== undefined) patch.status           = status;
  if (assignedToUserId !== undefined) patch.assignedToUserId = assignedToUserId || null;
  if (leadType         !== undefined) patch.leadType         = leadType === "reseller" ? "reseller" : leadType === "end_user" ? "end_user" : (sql`NULL` as unknown as string);

  if (logAction) {
    patch.lastActionType = lastActionType || null;
    patch.lastActionNote = lastActionNote || null;
    patch.lastActionAt   = new Date();
    // Auto-advance status to contacted if still new
    if (!status) {
      const [current] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
      if (current?.status === "new") patch.status = "contacted";
    }
  }

  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx
      .update(leadsTable)
      .set(patch)
      .where(eq(leadsTable.id, id))
      .returning();
    if (result && rawTagIds !== undefined) {
      await tx.delete(leadTagAssignmentsTable).where(eq(leadTagAssignmentsTable.leadId, id));
      if (tagIds.length) await tx.insert(leadTagAssignmentsTable).values(tagIds.map((tagId) => ({ leadId: id, tagId })));
    }
    return [result];
  });

  if (!updated) { res.status(404).json({ error: "not found" }); return; }
  res.json((await attachTags([updated]))[0]);
});

// ── DELETE /api/leads/:id ──────────────────────────────────────────────────
router.delete("/leads/:id", requireOwner, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }

  // Cancel any scheduled emails for this lead so they don't fire after deletion.
  await db
    .update(emailSendsTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(emailSendsTable.leadId, id),
        eq(emailSendsTable.status, "scheduled"),
      ),
    );

  await db.delete(leadsTable).where(eq(leadsTable.id, id));
  res.status(204).end();
});

// ── POST /api/leads/:id/ai-assistant ──────────────────────────────────────
// Generates a personalised outreach suggestion based on the lead's profile
// and the associated product. Returns:
//   { opener, approach, message, link? }
// approach: "value_link" | "collaboration" | "product_intro"
router.post("/leads/:id/ai-assistant", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  if (!lead) { res.status(404).json({ error: "not found" }); return; }

  // Fetch product if linked
  let product: typeof productsTable.$inferSelect | null = null;
  if (lead.productId) {
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, lead.productId)).limit(1);
    product = p ?? null;
  }

  const leadProfile = [
    `Name: ${[lead.firstName, lead.lastName].filter(Boolean).join(" ")}`,
    lead.title       ? `Title: ${lead.title}`             : null,
    lead.company     ? `Company: ${lead.company}`         : null,
    lead.linkedinUrl ? `LinkedIn: ${lead.linkedinUrl}`    : null,
    lead.notes       ? `Notes from rep: ${lead.notes}`   : null,
  ].filter(Boolean).join("\n");

  const productContext = product ? [
    `Product name: ${product.name}`,
    product.tagline      ? `Tagline: ${product.tagline}`                         : null,
    product.description  ? `Description: ${product.description}`                 : null,
    product.valueProp    ? `Value proposition: ${product.valueProp}`             : null,
    product.icp          ? `Ideal customer profile: ${product.icp}`              : null,
    product.targetMarket ? `Target market: ${product.targetMarket}`              : null,
    product.websiteUrl   ? `Website: ${product.websiteUrl}`                      : null,
  ].filter(Boolean).join("\n") : "No specific product context — give a general outreach suggestion.";

  const systemPrompt = `You are an elite B2B sales assistant helping a rep reach out to a prospect in a genuinely human way.

Given a prospect's profile and a product context, you will:
1. Write a short, natural-sounding OPENER (1–2 sentences) that references something specific about the person — their role, company, or a shared industry challenge. It should NOT sound like a template. No "I came across your profile", no hollow flattery.
2. Choose ONE approach that best fits the person's seniority and context:
   - "value_link": Share a link to a genuinely useful resource (article, tool, framework, report) relevant to their role — something they'd actually want to read. Include a real, plausible URL.
   - "collaboration": Propose a genuine collaboration angle or suggest they join a partner/referral program if they look like they could be a great fit.
   - "product_intro": Introduce the product in one punchy sentence tied to a specific pain point they likely have given their role.
3. Write a FULL MESSAGE (3–5 sentences) combining the opener + the chosen approach naturally. It should read like a real person wrote it.

Respond ONLY with valid JSON in this exact shape:
{
  "opener": "...",
  "approach": "value_link" | "collaboration" | "product_intro",
  "approachLabel": "...",
  "subject": "...",
  "message": "...",
  "link": "..." // only when approach is value_link — a real, plausible URL
}

Rules:
- Never use filler phrases like "I hope this finds you well", "I came across your profile", or "synergy".
- The opener must reference something SPECIFIC to this person.
- The full message must feel like one cohesive thought, not three stitched paragraphs.
- Keep total length under 120 words.
- Write a SUBJECT line (5–8 words, no clickbait, no ALL CAPS) that matches the chosen approach and opener — something the recipient would actually want to open.`;

  const userPrompt = `PROSPECT:\n${leadProfile}\n\nPRODUCT:\n${productContext}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
