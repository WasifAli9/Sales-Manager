import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, productsTable, teamMembersTable, goalsTable,
  aiAnalysesTable, platformStatesTable, pipelineDealsTable,
} from "@workspace/db";
import { runJson } from "../lib/ai";

const router = Router();

const GenerateGoalsBody = z.object({
  productId: z.number().int(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2020).optional(),
});

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const SYSTEM = `You are an expert sales & revenue strategist for a solo founder operating multiple B2B SaaS products pre-revenue.
Given a product, the founder's team (names + roles + hours/week), current pipeline, and platform readiness, generate realistic monthly goals for this specific product.

Rules:
- Goals must be SMART and achievable for the team size and hours available
- Include a mix of: revenue pipeline targets, outreach activity volumes, and one 30-day sprint goal
- Revenue goals should be in GBP (the founder uses GBP)
- Activity goals use count units (number of calls, demos, messages etc.)
- 30-day sprint goals are binary milestones (e.g. "Land first paid customer", "Publish 4 case studies")
- Scale targets to the team's actual bandwidth (hours per week × weeks in month)
- Be specific and direct — no filler, no caveats
- Consider existing goals to avoid duplication
- Return ONLY strict JSON: {"goals":[{"kind":"revenue|activity|thirty_day","title":"...","metric":"...","targetValue":number,"unit":"currency|count|percent","rationale":"...","deadline":"YYYY-MM-DD"}]}
- Generate 4-7 goals total. Deadline = last day of the target month.`;

router.post("/goals/generate", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const parsed = GenerateGoalsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const now = new Date();
  const { productId, month = now.getMonth() + 1, year = now.getFullYear() } = parsed.data;

  // Load product
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  // Load supporting context in parallel
  const [team, existingGoals, analyses, platformStates, pipeline] = await Promise.all([
    db.select().from(teamMembersTable).orderBy(teamMembersTable.createdAt),
    db.select().from(goalsTable).where(eq(goalsTable.productId, productId)),
    db.select({ kind: aiAnalysesTable.kind, content: aiAnalysesTable.content })
      .from(aiAnalysesTable).where(eq(aiAnalysesTable.productId, productId)),
    db.select().from(platformStatesTable).where(eq(platformStatesTable.productId, productId)),
    db.select().from(pipelineDealsTable)
      .where(and(eq(pipelineDealsTable.productId, productId))),
  ]);

  // Build team context
  const teamContext = team.length === 0
    ? "Team: Solo founder (no team members added yet — assume 40 hrs/week available)"
    : `Team:\n${team.map(m =>
        `- ${m.name} (${m.role}${m.focus ? ", focus: " + m.focus : ""}${m.hoursPerWeek ? ", " + m.hoursPerWeek + "h/week" : ""}${m.notes ? ": " + m.notes : ""})`
      ).join("\n")}`;

  // Build pipeline context
  const activePipeline = pipeline.filter(d => d.stage !== "closed_lost");
  const pipelineContext = activePipeline.length === 0
    ? "Pipeline: No active deals"
    : `Active pipeline (${activePipeline.length} deals):\n${activePipeline.map(d =>
        `- ${d.contactName}${d.companyName ? " / " + d.companyName : ""}: £${Math.round((parseFloat(d.value as any) || 0) * ({USD:0.79,GBP:1,AED:0.215}[(d.currency as string)||"USD"]||1)).toLocaleString()} @ ${d.probability}% (${d.stage})`
      ).join("\n")}`;

  // Build platform context
  const platformContext = platformStates.length === 0
    ? "Platforms: None configured"
    : `Platform stages: ${platformStates.map(s => `${s.platform}=${s.stage}`).join(", ")}`;

  // Build existing goals context
  const existingContext = existingGoals.length === 0
    ? "Existing goals: None"
    : `Existing goals (avoid duplicating):\n${existingGoals.map(g =>
        `- ${g.kind}: "${g.title}" — target ${g.targetValue} ${g.unit}`
      ).join("\n")}`;

  // Build analyses context
  const analysisContext = analyses.length === 0
    ? ""
    : analyses.slice(0, 2).map(a => `${a.kind} analysis: ${JSON.stringify(a.content).slice(0, 800)}`).join("\n");

  const monthName = MONTH_NAMES[month - 1];
  const lastDay = new Date(year, month, 0).getDate();
  const deadline = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const userPrompt = `Product: "${product.name}"
Tagline: ${product.tagline ?? "n/a"}
Status: ${product.status}
Target month: ${monthName} ${year} (deadline: ${deadline})

${teamContext}

${pipelineContext}

${platformContext}

${existingContext}

${analysisContext}

Generate realistic, specific monthly goals for this product and team. Deadline for all goals: ${deadline}.`;

  const { json } = await runJson(SYSTEM, userPrompt);
  const items = (json as { goals?: unknown[] })?.goals;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(500).json({ error: "AI returned no goals — try again" });
    return;
  }

  // Validate and clean each goal
  const GoalSchema = z.object({
    kind: z.enum(["revenue", "activity", "thirty_day"]),
    title: z.string().min(1),
    metric: z.string().min(1),
    targetValue: z.number(),
    unit: z.enum(["currency", "count", "percent"]),
    rationale: z.string().optional(),
    deadline: z.string().optional(),
  });

  const valid = items
    .map(g => GoalSchema.safeParse(g))
    .filter(r => r.success)
    .map(r => ({ ...(r as any).data, productId }));

  if (valid.length === 0) {
    res.status(500).json({ error: "AI returned invalid goal shapes — try again" });
    return;
  }

  res.json({ goals: valid });
});

// Bulk insert accepted goals
router.post("/goals/bulk", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const GoalItem = z.object({
    productId: z.number().int(),
    kind: z.enum(["revenue", "activity", "thirty_day"]),
    title: z.string().min(1),
    metric: z.string().min(1),
    targetValue: z.number(),
    unit: z.enum(["currency", "count", "percent"]),
    deadline: z.string().optional(),
  });
  const Body = z.object({ goals: z.array(GoalItem).min(1) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const inserted = await db.insert(goalsTable).values(
    parsed.data.goals.map(g => ({ ...g, currentValue: 0 }))
  ).returning();
  res.status(201).json(inserted);
});

export default router;
