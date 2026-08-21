export const STRATEGIST_ANALYSIS_KINDS = [
  "icp",
  "competitors",
  "value_prop",
  "gtm",
  "cadence",
] as const;

export type StrategistAnalysisKind = (typeof STRATEGIST_ANALYSIS_KINDS)[number];

type StrategyAnalysis = {
  id?: number;
  kind: string;
  content: unknown;
  grounded?: boolean;
  createdAt?: Date | string;
};

type StrategyProductContext = {
  name: string;
  description?: string | null;
  tagline?: string | null;
  targetMarket?: string | null;
  websiteUrl?: string | null;
};

const ANALYSIS_TITLES: Record<StrategistAnalysisKind, string> = {
  icp: "Ideal Customer Profile",
  competitors: "Competitive Landscape",
  value_prop: "Value Proposition and Offer",
  gtm: "Go-to-Market Plan",
  cadence: "Sales Cadence",
};

export function getMissingStrategistAnalyses(
  analyses: Pick<StrategyAnalysis, "kind">[],
): StrategistAnalysisKind[] {
  const completed = new Set(analyses.map((analysis) => analysis.kind));
  return STRATEGIST_ANALYSIS_KINDS.filter((kind) => !completed.has(kind));
}

function toTimestamp(value: Date | string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function isNewerAnalysis(candidate: StrategyAnalysis, current: StrategyAnalysis): boolean {
  const candidateTimestamp = toTimestamp(candidate.createdAt);
  const currentTimestamp = toTimestamp(current.createdAt);
  if (candidateTimestamp !== currentTimestamp) return candidateTimestamp > currentTimestamp;
  return (candidate.id ?? Number.NEGATIVE_INFINITY) > (current.id ?? Number.NEGATIVE_INFINITY);
}

export function selectLatestStrategistAnalyses(
  analyses: StrategyAnalysis[],
): Map<StrategistAnalysisKind, StrategyAnalysis> {
  const byKind = new Map<StrategistAnalysisKind, StrategyAnalysis>();
  for (const analysis of analyses) {
    if (!STRATEGIST_ANALYSIS_KINDS.includes(analysis.kind as StrategistAnalysisKind)) continue;
    const kind = analysis.kind as StrategistAnalysisKind;
    const current = byKind.get(kind);
    if (!current || isNewerAnalysis(analysis, current)) byKind.set(kind, analysis);
  }
  return byKind;
}

function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseContent(content: unknown): unknown {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function renderValue(value: unknown, indent = ""): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [`${indent}${String(value)}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return renderObject(item as Record<string, unknown>, `${indent}  `).map((line, index) =>
          index === 0 ? `${indent}- ${line.trimStart()}` : line,
        );
      }
      const lines = renderValue(item, `${indent}  `);
      return lines.length ? [`${indent}- ${lines[0].trimStart()}`, ...lines.slice(1)] : [];
    });
  }
  if (typeof value === "object") return renderObject(value as Record<string, unknown>, indent);
  return [];
}

function renderObject(value: Record<string, unknown>, indent = ""): string[] {
  return Object.entries(value).flatMap(([key, nested]) => {
    if (nested == null) return [];
    if (typeof nested === "string" || typeof nested === "number" || typeof nested === "boolean") {
      return [`${indent}- **${humanize(key)}:** ${String(nested)}`];
    }
    const children = renderValue(nested, `${indent}  `);
    return [`${indent}- **${humanize(key)}:**`, ...children];
  });
}

function renderAnalysis(content: unknown): string {
  const parsed = parseContent(content);
  if (typeof parsed === "string") return parsed.trim() || "No detail was generated.";
  const lines = renderValue(parsed);
  return lines.length ? lines.join("\n") : "No detail was generated.";
}

export function buildStrategyDocument(
  product: StrategyProductContext,
  analyses: StrategyAnalysis[],
): string {
  const byKind = selectLatestStrategistAnalyses(analyses);

  const productContext = [
    `- **Product:** ${product.name}`,
    product.tagline ? `- **Tagline:** ${product.tagline}` : null,
    product.description ? `- **Description:** ${product.description}` : null,
    product.targetMarket ? `- **Target Market:** ${product.targetMarket}` : null,
    product.websiteUrl ? `- **Website:** ${product.websiteUrl}` : null,
  ].filter((line): line is string => Boolean(line));

  const sections = STRATEGIST_ANALYSIS_KINDS.map((kind) => {
    const analysis = byKind.get(kind);
    const verificationNote = analysis?.grounded === false
      ? "\n\n> Note: This analysis was generated without supplied grounding research. Verify factual claims before using them externally."
      : "";
    return `## ${ANALYSIS_TITLES[kind]}\n\n${renderAnalysis(analysis?.content)}${verificationNote}`;
  });

  return [
    "# Sales Strategy Document",
    "This document combines the completed Strategist analyses into one working sales strategy.",
    "## Product Context",
    productContext.join("\n"),
    ...sections,
  ].join("\n\n");
}