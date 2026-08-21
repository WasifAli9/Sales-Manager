import { Router, type IRouter } from "express";
import { db, resourcesTable, activitiesTable } from "@workspace/db";
import { RunToolAdvisorResponse } from "@workspace/api-zod";
import { desc } from "drizzle-orm";
import { runJson } from "../lib/ai";

import { toJson } from "../lib/serialize";

const router: IRouter = Router();

const ADVISOR_SYSTEM = `You are an automation advisor for a solo founder who must spend 90% of his time selling and wants to stop relying on people for manual work.
Given his current tool stack and recent manual tasks, suggest 2-4 NEW tools or automations (e.g. chaining Apollo -> GoHighLevel, LLM auto-drafting LinkedIn posts, HeyGen batch video, n8n/Make glue workflows, auto-scheduling). Do not suggest tools he already has unless the suggestion is a specific new automation chain using them.
For each suggestion give a one-line "what it removes from your plate" in the automates field.
Return ONLY strict JSON: {"suggestions":[{"name":"tool or automation name","category":"enrichment|outreach|content|video|scheduling|ai|webinar|other","monthlyCost":number,"automates":"one line: what it removes from his plate","notes":"how to wire it up, 1-2 sentences"}]}`;

router.post("/tool-advisor", async (req, res): Promise<void> => {
  const stack = await db.select().from(resourcesTable);
  const recentManual = await db
    .select()
    .from(activitiesTable)
    .orderBy(desc(activitiesTable.id))
    .limit(40);

  const { json } = await runJson(
    ADVISOR_SYSTEM,
    `Current stack: ${stack.map((r) => `${r.name} (${r.category}, ${r.status}${r.automates ? `, automates: ${r.automates}` : ""})`).join("; ") || "none"}.
Recent tasks (look for repetitive manual work): ${recentManual.map((a) => `[${a.category}] ${a.title}`).join("; ") || "none yet"}.`,
  );

  const items = (json as { suggestions?: unknown[] })?.suggestions;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(500).json({ error: "AI returned no suggestions — try again" });
    return;
  }

  const validCategories = [
    "enrichment",
    "outreach",
    "content",
    "video",
    "scheduling",
    "ai",
    "webinar",
    "other",
  ];
  const values = items
    .map((raw) => {
      const it = raw as Record<string, unknown>;
      const category = String(it["category"] ?? "other");
      return {
        name: String(it["name"] ?? "").slice(0, 200),
        category: validCategories.includes(category) ? category : "other",
        status: "considering",
        monthlyCost: Number.isFinite(Number(it["monthlyCost"]))
          ? Number(it["monthlyCost"])
          : null,
        automates:
          typeof it["automates"] === "string" ? it["automates"] : null,
        notes: typeof it["notes"] === "string" ? it["notes"] : null,
      };
    })
    .filter((v) => v.name.length > 0);

  const rows = await db.insert(resourcesTable).values(values).returning();
  res.status(201).json(RunToolAdvisorResponse.parse(toJson(rows)));
});

export default router;
