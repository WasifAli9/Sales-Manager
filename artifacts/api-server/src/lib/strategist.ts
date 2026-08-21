import type { Product, PlatformState } from "@workspace/db";
import { runJson } from "./ai";

export type AnalysisKind =
  | "icp"
  | "competitors"
  | "value_prop"
  | "gtm"
  | "cadence";

const VOICE_RULES = `Copy/voice rules: output must read human — direct, specific, no AI tells, no filler adjectives, no "in today's fast-paced world." When drafting outreach or offers, use direct-response construction (clear promise, proof, specific mechanism, risk reversal, deadline). Offers must be a genuine no-brainer for the FIRST customers, not generic.`;

const BASE_SYSTEM = `You are a direct-response B2B growth strategist for a solo founder with NO customers yet and zero ad budget. Channels available: LinkedIn, Apollo (enrichment+lists), email, webinars, YouTube, X, Canva, HeyGen, GoHighLevel.
Return ONLY strict JSON matching the requested schema — no prose, no markdown fences.
Rules: name the single most specific bleeding-neck persona; be concrete about where they congregate (specific groups/subreddits/associations, not just "LinkedIn"); write all customer-facing copy human and specific (no AI tells, no filler); construct any offer as a genuine no-brainer for first customers with clear risk reversal.
${VOICE_RULES}`;

const SCHEMAS: Record<AnalysisKind, string> = {
  icp: `{"persona":"one-line label","who":"who they are, role, company type/size","pain":"the exact bleeding-neck pain","whyNow":"why they'd buy now without education","congregates":[{"place":"specific community/group/association","platform":"platform name","note":"how to show up there"}]}`,
  competitors: `{"competitors":[{"name":"","positioning":"","weaknesses":["..."],"gap":"the wedge this leaves open"}],"wedge":"the one wedge value the founder can deliver against this landscape"}`,
  value_prop: `{"valueProp":"the one sentence that makes the persona feel understood instantly","supportingPoints":["..."],"offer":{"promise":"","proof":"","mechanism":"","riskReversal":"","deadline":""}}`,
  gtm: `{"summary":"one-paragraph realistic path with zero paid ads","plays":[{"channel":"one of the available channels","play":"specific motion","firstStep":"the very first concrete action","expectedOutcome":""}]}`,
  cadence: `{"webinar":{"when":"","topic":"","frequency":""},"posting":[{"platform":"","what":"","frequency":""}],"outreach":{"angle":"","dailyVolume":"","channel":""}}`,
};

export function buildStrategistPrompt(
  kind: AnalysisKind,
  product: Product,
  platformStates: PlatformState[],
  pastedResearch?: string,
): { system: string; user: string } {
  const stages =
    platformStates.length > 0
      ? platformStates
          .map((s) => `${s.platform}: ${s.stage}`)
          .join(", ")
      : "none tracked yet";

  let user = `Product: ${product.name} — ${product.description ?? product.tagline ?? "no description"} — target market: ${product.targetMarket ?? "not specified"}.
Current platform stages: ${stages}.
Analysis kind: ${kind}.
Return JSON matching exactly this schema: ${SCHEMAS[kind]}`;

  if (kind === "competitors") {
    user += pastedResearch
      ? `\n\nGround ALL competitor claims strictly in this research provided by the founder — do not invent competitors or facts beyond it:\n${pastedResearch}`
      : `\n\nNo research was provided. Only name competitors you are highly confident actually exist; if unsure, describe competitor CATEGORIES instead of naming specific companies. This output will be marked as unverified.`;
  }

  return { system: BASE_SYSTEM, user };
}

export async function runStrategistAnalysis(
  kind: AnalysisKind,
  product: Product,
  platformStates: PlatformState[],
  pastedResearch?: string,
): Promise<{ content: unknown; modelUsed: string; grounded: boolean }> {
  const { system, user } = buildStrategistPrompt(
    kind,
    product,
    platformStates,
    pastedResearch,
  );
  const { json, modelUsed } = await runJson(system, user);
  const grounded = kind !== "competitors" || Boolean(pastedResearch);
  return { content: json, modelUsed, grounded };
}
