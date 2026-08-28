import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { leadsTable } from "./leads";
import { emailSequencesTable } from "./emailSequences";

/** Canonical company per product (workspace). */
export const companiesTable = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain"),
    website: text("website"),
    industry: text("industry"),
    employeeCount: integer("employee_count"),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("companies_product_domain_idx").on(table.productId, table.domain),
    index("companies_product_normalized_idx").on(table.productId, table.normalizedName),
  ],
);

export const companyIntelligenceTable = pgTable(
  "company_intelligence",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    summary: text("summary"),
    industry: text("industry"),
    subsector: text("subsector"),
    employeeEstimate: integer("employee_estimate"),
    locationsEstimate: text("locations_estimate"),
    operatingModel: text("operating_model"),
    complexity: text("complexity"),
    whatTheyDo: text("what_they_do"),
    customerType: text("customer_type"),
    businessModel: text("business_model"),
    servicesOffered: text("services_offered"),
    websiteEvidence: text("website_evidence"),
    researchStatus: text("research_status").notNull().default("pending"),
    researchVersion: integer("research_version").notNull().default(1),
    sourceData: jsonb("source_data").$type<Record<string, unknown>>(),
    researchedAt: timestamp("researched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("company_intelligence_company_product_uidx").on(table.companyId, table.productId)],
);

/** Structured ICP definition per product. */
export const productIcpProfilesTable = pgTable(
  "product_icp_profiles",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    targetIndustries: jsonb("target_industries").$type<string[]>().notNull().default([]),
    employeeMin: integer("employee_min"),
    employeeMax: integer("employee_max"),
    targetGeographies: jsonb("target_geographies").$type<string[]>().notNull().default([]),
    targetRoles: jsonb("target_roles").$type<string[]>().notNull().default([]),
    positiveCharacteristics: jsonb("positive_characteristics").$type<string[]>().notNull().default([]),
    negativeCharacteristics: jsonb("negative_characteristics").$type<string[]>().notNull().default([]),
    hardExclusions: jsonb("hard_exclusions").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("product_icp_profiles_product_uidx").on(table.productId)],
);

export const companyIcpAnalysisTable = pgTable(
  "company_icp_analysis",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    industryScore: integer("industry_score").notNull().default(0),
    sizeScore: integer("size_score").notNull().default(0),
    geographyScore: integer("geography_score").notNull().default(0),
    complexityScore: integer("complexity_score").notNull().default(0),
    problemFitScore: integer("problem_fit_score").notNull().default(0),
    signalScore: integer("signal_score").notNull().default(0),
    totalScore: integer("total_score").notNull().default(0),
    disqualified: boolean("disqualified").notNull().default(false),
    disqualificationReason: text("disqualification_reason"),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("company_icp_analysis_company_product_uidx").on(table.companyId, table.productId)],
);

export const contactIntelligenceTable = pgTable(
  "contact_intelligence",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    persona: text("persona"),
    estimatedDecisionRole: text("estimated_decision_role"),
    roleRelevance: integer("role_relevance").notNull().default(0),
    seniorityRelevance: integer("seniority_relevance").notNull().default(0),
    contactScore: integer("contact_score").notNull().default(0),
    whyThisPerson: text("why_this_person"),
    suggestedOpeningAngle: text("suggested_opening_angle"),
    personalisationFacts: jsonb("personalisation_facts").$type<string[]>(),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("contact_intelligence_lead_uidx").on(table.leadId)],
);

export const buyingSignalsTable = pgTable(
  "buying_signals",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(),
    description: text("description"),
    evidence: text("evidence"),
    source: text("source"),
    sourceUrl: text("source_url"),
    confidence: integer("confidence").notNull().default(50),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("buying_signals_company_idx").on(table.companyId)],
);

export const painHypothesesTable = pgTable(
  "pain_hypotheses",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    painCategory: text("pain_category").notNull(),
    confidence: integer("confidence").notNull().default(50),
    evidence: text("evidence"),
    priority: integer("priority").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("pain_hypotheses_company_product_idx").on(table.companyId, table.productId)],
);

export const leadScoresTable = pgTable(
  "lead_scores",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
    icpScore: integer("icp_score").notNull().default(0),
    contactScore: integer("contact_score").notNull().default(0),
    buyingSignalScore: integer("buying_signal_score").notNull().default(0),
    priorityScore: integer("priority_score").notNull().default(0),
    tier: text("tier").notNull().default("C"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("lead_scores_lead_uidx").on(table.leadId)],
);

export const campaignRecommendationsTable = pgTable(
  "campaign_recommendations",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    sequenceId: integer("sequence_id").references(() => emailSequencesTable.id, { onDelete: "set null" }),
    campaignAngle: text("campaign_angle"),
    confidence: integer("confidence").notNull().default(50),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("campaign_recommendations_lead_idx").on(table.leadId)],
);

export const researchJobsTable = pgTable(
  "research_jobs",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("research_jobs_status_idx").on(table.status),
    index("research_jobs_product_idx").on(table.productId),
  ],
);

export const leadIntelligenceAuditTable = pgTable(
  "lead_intelligence_audit",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").references(() => productsTable.id, { onDelete: "cascade" }),
    leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
    companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("lead_intelligence_audit_product_idx").on(table.productId)],
);

export type Company = typeof companiesTable.$inferSelect;
export type CompanyIntelligence = typeof companyIntelligenceTable.$inferSelect;
export type ProductIcpProfile = typeof productIcpProfilesTable.$inferSelect;
export type LeadScore = typeof leadScoresTable.$inferSelect;
export type ResearchJob = typeof researchJobsTable.$inferSelect;
