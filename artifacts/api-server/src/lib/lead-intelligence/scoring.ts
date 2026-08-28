/**
 * Deterministic ICP scoring against a product ICP profile.
 */
import type { ProductIcpProfile } from "@workspace/db/schema";

export type CompanyScoreInput = {
  industry?: string | null;
  employeeCount?: number | null;
  location?: string | null;
  summary?: string | null;
  whatTheyDo?: string | null;
  complexity?: string | null;
};

export type IcpScoreResult = {
  industryScore: number;
  sizeScore: number;
  geographyScore: number;
  complexityScore: number;
  problemFitScore: number;
  signalScore: number;
  totalScore: number;
  disqualified: boolean;
  disqualificationReason: string | null;
  reasoning: string;
};

function includesAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => n.trim() && h.includes(n.trim().toLowerCase()));
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function scoreCompanyAgainstIcp(
  company: CompanyScoreInput,
  profile: Pick<
    ProductIcpProfile,
    | "targetIndustries"
    | "employeeMin"
    | "employeeMax"
    | "targetGeographies"
    | "positiveCharacteristics"
    | "negativeCharacteristics"
    | "hardExclusions"
  > | null,
): IcpScoreResult {
  if (!profile) {
    return {
      industryScore: 50,
      sizeScore: 50,
      geographyScore: 50,
      complexityScore: 50,
      problemFitScore: 50,
      signalScore: 40,
      totalScore: 48,
      disqualified: false,
      disqualificationReason: null,
      reasoning: "No structured ICP profile configured; using neutral baseline scores.",
    };
  }

  const industries = profile.targetIndustries ?? [];
  const geos = profile.targetGeographies ?? [];
  const positives = profile.positiveCharacteristics ?? [];
  const negatives = profile.negativeCharacteristics ?? [];
  const exclusions = (profile.hardExclusions ?? {}) as {
    employeeBelow?: number;
    industries?: string[];
    geographiesOutside?: string[];
  };

  const industryText = `${company.industry ?? ""} ${company.whatTheyDo ?? ""} ${company.summary ?? ""}`;
  const locationText = company.location ?? "";
  const employees = company.employeeCount;

  // Hard exclusions
  if (exclusions.employeeBelow != null && employees != null && employees < exclusions.employeeBelow) {
    return {
      industryScore: 0,
      sizeScore: 0,
      geographyScore: 0,
      complexityScore: 0,
      problemFitScore: 0,
      signalScore: 0,
      totalScore: 0,
      disqualified: true,
      disqualificationReason: `Employee count ${employees} below hard minimum ${exclusions.employeeBelow}`,
      reasoning: "Hard exclusion: company too small.",
    };
  }
  if (exclusions.industries?.length && includesAny(industryText, exclusions.industries)) {
    return {
      industryScore: 0,
      sizeScore: 0,
      geographyScore: 0,
      complexityScore: 0,
      problemFitScore: 0,
      signalScore: 0,
      totalScore: 0,
      disqualified: true,
      disqualificationReason: `Industry matched hard exclusion`,
      reasoning: "Hard exclusion: industry not allowed.",
    };
  }
  if (exclusions.geographiesOutside?.length && locationText) {
    const inAllowed = includesAny(locationText, geos.length ? geos : ["united kingdom", "uk", "united states", "usa"]);
    const outsideBlocked = includesAny(locationText, exclusions.geographiesOutside);
    if (outsideBlocked && !inAllowed) {
      return {
        industryScore: 0,
        sizeScore: 0,
        geographyScore: 0,
        complexityScore: 0,
        problemFitScore: 0,
        signalScore: 0,
        totalScore: 0,
        disqualified: true,
        disqualificationReason: "Geography outside allowed territory",
        reasoning: "Hard exclusion: geography.",
      };
    }
  }

  let industryScore = 40;
  if (industries.length === 0) industryScore = 55;
  else if (includesAny(industryText, industries)) industryScore = 92;
  else if (industryText.trim()) industryScore = 28;

  let sizeScore = 50;
  if (employees == null) sizeScore = 45;
  else if (profile.employeeMin != null || profile.employeeMax != null) {
    const min = profile.employeeMin ?? 0;
    const max = profile.employeeMax ?? 100_000;
    if (employees >= min && employees <= max) sizeScore = 90;
    else if (employees < min) sizeScore = clamp(40 - (min - employees) / 10);
    else sizeScore = clamp(50 - (employees - max) / 50);
  }

  let geographyScore = 50;
  if (geos.length === 0) geographyScore = 55;
  else if (!locationText.trim()) geographyScore = 40;
  else if (includesAny(locationText, geos)) geographyScore = 90;
  else geographyScore = 25;

  let complexityScore = 55;
  if (company.complexity?.toLowerCase().includes("high")) complexityScore = 80;
  else if (company.complexity?.toLowerCase().includes("low")) complexityScore = 35;

  const blob = `${industryText} ${company.summary ?? ""}`.toLowerCase();
  let problemFitScore = 45;
  if (positives.length && includesAny(blob, positives)) problemFitScore = 85;
  if (negatives.length && includesAny(blob, negatives)) problemFitScore = Math.min(problemFitScore, 25);

  const signalScore = 40; // filled richer when buying signals exist

  const totalScore = clamp(
    industryScore * 0.3 +
      sizeScore * 0.2 +
      geographyScore * 0.15 +
      complexityScore * 0.1 +
      problemFitScore * 0.2 +
      signalScore * 0.05,
  );

  return {
    industryScore: clamp(industryScore),
    sizeScore: clamp(sizeScore),
    geographyScore: clamp(geographyScore),
    complexityScore: clamp(complexityScore),
    problemFitScore: clamp(problemFitScore),
    signalScore: clamp(signalScore),
    totalScore,
    disqualified: false,
    disqualificationReason: null,
    reasoning: `Industry ${clamp(industryScore)}, size ${clamp(sizeScore)}, geo ${clamp(geographyScore)}, fit ${clamp(problemFitScore)}.`,
  };
}

function titleIncludesWord(title: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(title);
}

export function scoreContactRelevance(
  title: string | null | undefined,
  targetRoles: string[],
): {
  persona: string;
  estimatedDecisionRole: string;
  roleRelevance: number;
  seniorityRelevance: number;
  contactScore: number;
  reasoning: string;
} {
  const t = (title ?? "").toLowerCase();
  const seniorityKeywords = [
    { role: "owner", score: 95, words: ["owner", "founder", "co-founder", "proprietor"] },
    { role: "c_level", score: 90, words: ["ceo", "coo", "cfo", "cto", "chief"] },
    { role: "director", score: 82, words: ["director", "managing director", "md"] },
    { role: "vp", score: 78, words: ["vp", "vice president", "head of"] },
    { role: "manager", score: 65, words: ["manager", "lead"] },
    { role: "specialist", score: 40, words: ["specialist", "coordinator", "assistant", "intern"] },
  ];

  let seniorityRelevance = 45;
  let estimatedDecisionRole = "unknown";
  for (const row of seniorityKeywords) {
    if (row.words.some((w) => titleIncludesWord(t, w))) {
      seniorityRelevance = row.score;
      estimatedDecisionRole = row.role;
      break;
    }
  }

  let roleRelevance = 40;
  if (targetRoles.length === 0) roleRelevance = 50;
  else if (targetRoles.some((r) => titleIncludesWord(t, r.toLowerCase()) || t.includes(r.toLowerCase()))) roleRelevance = 92;
  else if (t) roleRelevance = 35;

  const contactScore = Math.round(roleRelevance * 0.55 + seniorityRelevance * 0.45);
  const persona =
    estimatedDecisionRole === "owner" || estimatedDecisionRole === "c_level"
      ? "economic_buyer"
      : estimatedDecisionRole === "director" || estimatedDecisionRole === "vp"
        ? "champion"
        : estimatedDecisionRole === "manager"
          ? "influencer"
          : "unknown";

  return {
    persona,
    estimatedDecisionRole,
    roleRelevance,
    seniorityRelevance,
    contactScore,
    reasoning: `Title "${title ?? "unknown"}" → role ${estimatedDecisionRole}, contact score ${contactScore}.`,
  };
}

/** Priority = 0.5*ICP + 0.3*Contact + 0.2*Intent */
export function computePriorityScore(icp: number, contact: number, intent: number): number {
  return Math.round(icp * 0.5 + contact * 0.3 + intent * 0.2);
}

export function tierFromPriority(priority: number, disqualified: boolean): "A" | "B" | "C" | "Reject" {
  if (disqualified || priority < 40) return "Reject";
  if (priority >= 80) return "A";
  if (priority >= 60) return "B";
  return "C";
}

export function inferPainHypotheses(input: {
  industry?: string | null;
  whatTheyDo?: string | null;
  summary?: string | null;
  productIcpText?: string | null;
}): Array<{ painCategory: string; confidence: number; evidence: string; priority: number }> {
  const blob = `${input.industry ?? ""} ${input.whatTheyDo ?? ""} ${input.summary ?? ""} ${input.productIcpText ?? ""}`.toLowerCase();
  const out: Array<{ painCategory: string; confidence: number; evidence: string; priority: number }> = [];

  const rules: Array<{ category: string; keywords: string[]; confidence: number }> = [
    { category: "workforce_cover", keywords: ["cleaning", "facilities", "workforce", "shift", "staffing"], confidence: 72 },
    { category: "contractor_coordination", keywords: ["contractor", "subcontractor", "multi-site", "field"], confidence: 68 },
    { category: "scheduling_complexity", keywords: ["schedule", "roster", "dispatch", "jobs"], confidence: 65 },
    { category: "compliance_risk", keywords: ["compliance", "audit", "certification", "health and safety"], confidence: 60 },
    { category: "growth_ops", keywords: ["expand", "growth", "scaling", "new locations"], confidence: 58 },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((k) => blob.includes(k))) {
      out.push({
        painCategory: rule.category,
        confidence: rule.confidence,
        evidence: `Matched keywords in company/product context for ${rule.category}.`,
        priority: out.length + 1,
      });
    }
  }

  if (!out.length) {
    out.push({
      painCategory: "operational_efficiency",
      confidence: 45,
      evidence: "Default hypothesis when no stronger signal found.",
      priority: 1,
    });
  }

  return out.slice(0, 3);
}
