import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { contactListMembersTable, contactListsTable, leadsTable } from "@workspace/db/schema";
import { canAccessProduct } from "../lib/productAccess";

const router: IRouter = Router();

function isOwner(req: Request): boolean {
  return (req.user as { role?: string } | undefined)?.role === "owner";
}

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

async function getAccessibleList(req: Request, listId: number) {
  const conditions = [eq(contactListsTable.id, listId)];
  if (!isOwner(req)) conditions.push(eq(contactListsTable.createdByUserId, req.user!.id));
  const [list] = await db.select().from(contactListsTable).where(and(...conditions)).limit(1);
  if (!list || (list.productId && !await canAccessProduct(req, list.productId))) return null;
  return list;
}

async function visibleLeadIds(req: Request, requestedIds: number[]) {
  if (!requestedIds.length) return [];
  const conditions = [inArray(leadsTable.id, requestedIds)];
  if (!isOwner(req)) conditions.push(eq(leadsTable.assignedToUserId, req.user!.id));
  const rows = await db.select({ id: leadsTable.id }).from(leadsTable).where(and(...conditions));
  return rows.map((row) => row.id);
}

async function leadsMatchListProduct(leadIds: number[], productId: number | null) {
  if (!productId || !leadIds.length) return true;
  const rows = await db.select({ id: leadsTable.id, productId: leadsTable.productId })
    .from(leadsTable)
    .where(inArray(leadsTable.id, leadIds));
  return rows.length === leadIds.length && rows.every((lead) => lead.productId === productId);
}

async function leadsUseAccessibleProducts(req: Request, leadIds: number[]) {
  if (!leadIds.length || isOwner(req)) return true;
  const rows = await db.select({ id: leadsTable.id, productId: leadsTable.productId })
    .from(leadsTable)
    .where(inArray(leadsTable.id, leadIds));
  if (rows.length !== leadIds.length) return false;
  const productIds = [...new Set(rows.map((lead) => lead.productId).filter((id): id is number => id !== null))];
  return (await Promise.all(productIds.map((productId) => canAccessProduct(req, productId)))).every(Boolean);
}

// GET /api/contact-lists?productId=123
router.get("/contact-lists", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const rawProductId = typeof req.query.productId === "string" ? req.query.productId : undefined;
  const productId = rawProductId ? Number.parseInt(rawProductId, 10) : null;
  if (productId && Number.isInteger(productId) && !await canAccessProduct(req, productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }
  const conditions = [];
  if (productId && Number.isInteger(productId)) conditions.push(eq(contactListsTable.productId, productId));
  if (!isOwner(req)) conditions.push(eq(contactListsTable.createdByUserId, req.user!.id));

  const lists = await db
    .select({
      id: contactListsTable.id,
      name: contactListsTable.name,
      productId: contactListsTable.productId,
      createdAt: contactListsTable.createdAt,
      memberCount: sql<number>`cast(count(${contactListMembersTable.id}) as int)`,
    })
    .from(contactListsTable)
    .leftJoin(contactListMembersTable, eq(contactListMembersTable.listId, contactListsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(contactListsTable.id)
    .orderBy(contactListsTable.createdAt);

  const visibleLists = isOwner(req)
    ? lists
    : (await Promise.all(lists.map(async (list) =>
      !list.productId || await canAccessProduct(req, list.productId) ? list : null,
    ))).filter((list): list is (typeof lists)[number] => Boolean(list));
  res.json(visibleLists);
});

// GET /api/contact-lists/:id
router.get("/contact-lists/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const listId = parseId(req.params.id);
  if (!listId) {
    res.status(400).json({ error: "Invalid contact list" });
    return;
  }
  const list = await getAccessibleList(req, listId);
  if (!list) {
    res.status(404).json({ error: "Contact list not found" });
    return;
  }

  const leadConditions = [eq(contactListMembersTable.listId, listId)];
  if (!isOwner(req)) leadConditions.push(eq(leadsTable.assignedToUserId, req.user!.id));
  const members = await db
    .select({
      id: leadsTable.id,
      firstName: leadsTable.firstName,
      lastName: leadsTable.lastName,
      email: leadsTable.email,
      company: leadsTable.company,
      productId: leadsTable.productId,
    })
    .from(contactListMembersTable)
    .innerJoin(leadsTable, eq(contactListMembersTable.leadId, leadsTable.id))
    .where(and(...leadConditions))
    .orderBy(leadsTable.firstName, leadsTable.lastName);

  res.json({ ...list, members });
});

// POST /api/contact-lists
router.post("/contact-lists", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { name, productId, leadIds } = req.body as {
    name?: unknown;
    productId?: unknown;
    leadIds?: unknown;
  };
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const requestedIds = Array.isArray(leadIds)
    ? [...new Set(leadIds.filter((id): id is number => Number.isInteger(id) && id > 0))]
    : [];
  const selectedProductId = typeof productId === "number" && Number.isInteger(productId) && productId > 0
    ? productId
    : null;

  if (!trimmedName || trimmedName.length > 120) {
    res.status(400).json({ error: "Enter a contact list name (up to 120 characters)" });
    return;
  }
  if (!requestedIds.length) {
    res.status(400).json({ error: "Select at least one lead for this contact list" });
    return;
  }
  if (selectedProductId && !await canAccessProduct(req, selectedProductId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }

  const permittedLeadIds = await visibleLeadIds(req, requestedIds);
  if (permittedLeadIds.length !== requestedIds.length) {
    res.status(403).json({ error: "You can only add leads you are allowed to view" });
    return;
  }
  if (!await leadsMatchListProduct(permittedLeadIds, selectedProductId)) {
    res.status(400).json({ error: "A product contact list can only contain leads for that product" });
    return;
  }
  if (!await leadsUseAccessibleProducts(req, permittedLeadIds)) {
    res.status(403).json({ error: "You do not have access to every lead's product" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [list] = await tx
      .insert(contactListsTable)
      .values({ name: trimmedName, productId: selectedProductId, createdByUserId: req.user!.id })
      .returning();
    await tx.insert(contactListMembersTable).values(
      permittedLeadIds.map((leadId) => ({ listId: list.id, leadId })),
    );
    return list;
  });

  res.status(201).json({ ...result, memberCount: permittedLeadIds.length });
});

// POST /api/contact-lists/:id/members
router.post("/contact-lists/:id/members", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const listId = parseId(req.params.id);
  const requestedIds: number[] = Array.isArray(req.body?.leadIds)
    ? (req.body.leadIds as unknown[]).filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
    : [];
  if (!listId || !requestedIds.length) {
    res.status(400).json({ error: "A contact list and one or more leads are required" });
    return;
  }
  const list = await getAccessibleList(req, listId);
  if (!list) {
    res.status(404).json({ error: "Contact list not found" });
    return;
  }
  const permittedLeadIds = await visibleLeadIds(req, requestedIds);
  if (permittedLeadIds.length !== requestedIds.length) {
    res.status(403).json({ error: "You can only add leads you are allowed to view" });
    return;
  }
  if (!await leadsMatchListProduct(permittedLeadIds, list.productId)) {
    res.status(400).json({ error: "A product contact list can only contain leads for that product" });
    return;
  }
  if (!await leadsUseAccessibleProducts(req, permittedLeadIds)) {
    res.status(403).json({ error: "You do not have access to every lead's product" });
    return;
  }
  await db
    .insert(contactListMembersTable)
    .values(permittedLeadIds.map((leadId) => ({ listId, leadId })))
    .onConflictDoNothing();
  res.json({ added: permittedLeadIds.length });
});

router.delete("/contact-lists/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const listId = parseId(req.params.id);
  if (!listId) {
    res.status(400).json({ error: "Invalid contact list" });
    return;
  }
  const list = await getAccessibleList(req, listId);
  if (!list) {
    res.status(404).json({ error: "Contact list not found" });
    return;
  }
  await db.delete(contactListsTable).where(eq(contactListsTable.id, list.id));
  res.status(204).end();
});

export default router;