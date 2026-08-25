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

function escapeInline(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function renderListItem(text: string, indent = ""): string {
  return `${indent}- ${escapeInline(text)}`;
}

function renderNestedValue(value: unknown, indent = ""): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [renderListItem(String(value), indent)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>).filter(([, v]) => v != null);
        if (!entries.length) return [];
        const [firstKey, firstVal] = entries[0]!;
        const title =
          typeof firstVal === "string" || typeof firstVal === "number"
            ? String(firstVal)
            : humanize(firstKey);
        const rest = entries.slice(1).flatMap(([key, nested]) => {
          if (typeof nested === "string" || typeof nested === "number" || typeof nested === "boolean") {
            return [`${indent}  - **${humanize(key)}:** ${escapeInline(String(nested))}`];
          }
          return [
            `${indent}  - **${humanize(key)}:**`,
            ...renderNestedValue(nested, `${indent}    `),
          ];
        });
        return [`${indent}- **${escapeInline(title)}**`, ...rest];
      }
      return renderNestedValue(item, indent);
    });
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      if (nested == null) return [];
      if (typeof nested === "string" || typeof nested === "number" || typeof nested === "boolean") {
        return [`${indent}- **${humanize(key)}:** ${escapeInline(String(nested))}`];
      }
      return [`${indent}- **${humanize(key)}:**`, ...renderNestedValue(nested, `${indent}  `)];
    });
  }
  return [];
}

function renderTopLevelField(key: string, value: unknown): string[] {
  const title = humanize(key);
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [`### ${title}`, "", escapeInline(String(value)), ""];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")) {
    return [
      `### ${title}`,
      "",
      ...value.map((item) => renderListItem(String(item))),
      "",
    ];
  }
  return [`### ${title}`, "", ...renderNestedValue(value), ""];
}

function renderAnalysis(content: unknown): string {
  const parsed = parseContent(content);
  if (typeof parsed === "string") return escapeInline(parsed) || "No detail was generated.";
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const lines = renderNestedValue(parsed);
    return lines.length ? lines.join("\n") : "No detail was generated.";
  }

  const lines = Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) =>
    renderTopLevelField(key, value),
  );
  return lines.length ? lines.join("\n").trim() : "No detail was generated.";
}

export function buildStrategyDocument(
  product: StrategyProductContext,
  analyses: StrategyAnalysis[],
): string {
  const byKind = selectLatestStrategistAnalyses(analyses);
  const generatedAt = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const productContext = [
    `| Field | Detail |`,
    `| --- | --- |`,
    `| Product | ${product.name} |`,
    product.tagline ? `| Tagline | ${product.tagline} |` : null,
    product.description ? `| Description | ${product.description} |` : null,
    product.targetMarket ? `| Target Market | ${product.targetMarket} |` : null,
    product.websiteUrl ? `| Website | ${product.websiteUrl} |` : null,
  ].filter((line): line is string => Boolean(line));

  const sections = STRATEGIST_ANALYSIS_KINDS.map((kind) => {
    const analysis = byKind.get(kind);
    const verificationNote = analysis?.grounded === false
      ? "\n\n> **Note:** This analysis was generated without supplied grounding research. Verify factual claims before using them externally."
      : "";
    return [
      `## ${ANALYSIS_TITLES[kind]}`,
      "",
      renderAnalysis(analysis?.content),
      verificationNote,
    ].join("\n").trim();
  });

  return [
    `# Sales Strategy Document`,
    "",
    `**${product.name}**`,
    "",
    `Generated ${generatedAt} from The Strategist analyses.`,
    "",
    "This document combines the completed Strategist analyses into one working sales strategy.",
    "",
    "---",
    "",
    "## Product Context",
    "",
    productContext.join("\n"),
    "",
    "---",
    "",
    ...sections.flatMap((section, index) =>
      index === sections.length - 1 ? [section, ""] : [section, "", "---", ""],
    ),
  ].join("\n").trim() + "\n";
}
