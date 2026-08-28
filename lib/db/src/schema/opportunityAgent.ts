import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { pipelineDealsTable } from "./pipeline";
import { leadsTable } from "./leads";

export const opportunityIntelligenceTable = pgTable(
  "opportunity_intelligence",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id")
      .notNull()
      .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
    summary: text("summary"),
    primaryPain: text("primary_pain"),
    painSeverity: text("pain_severity").default("hypothesis"),
    qualificationScore: integer("qualification_score").default(0),
    dealStrategy: text("deal_strategy"),
    recommendedNextAction: text("recommended_next_action"),
    nextActionReason: text("next_action_reason"),
    nextActionDue: timestamp("next_action_due", { withTimezone: true }),
    attentionPriority: integer("attention_priority").default(0),
    stageRecommendation: text("stage_recommendation"),
    stageRecommendationConfidence: integer("stage_recommendation_confidence"),
    stageRecommendationEvidence: text("stage_recommendation_evidence"),
    rawAiJson: jsonb("raw_ai_json").$type<Record<string, unknown>>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("opportunity_intelligence_deal_uidx").on(t.dealId)],
);

export const opportunityContactsTable = pgTable("opportunity_contacts", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  name: text("name"),
  stakeholderRole: text("stakeholder_role"),
  influence: text("influence"),
  sentiment: text("sentiment"),
  decisionRoleConfidence: integer("decision_role_confidence"),
  primaryContact: boolean("primary_contact").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opportunityRisksTable = pgTable(
  "opportunity_risks",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id")
      .notNull()
      .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
    riskType: text("risk_type").notNull(),
    description: text("description"),
    severity: text("severity").default("medium"),
    evidence: text("evidence"),
    status: text("status").notNull().default("open"),
    recommendedMitigation: text("recommended_mitigation"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("opportunity_risks_deal_idx").on(t.dealId, t.status)],
);

export const opportunityObjectionsTable = pgTable("opportunity_objections", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
  objectionType: text("objection_type"),
  description: text("description"),
  evidence: text("evidence"),
  status: text("status").notNull().default("open"),
  raisedAt: timestamp("raised_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const opportunityQualificationTable = pgTable(
  "opportunity_qualification",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id")
      .notNull()
      .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
    problemStatus: text("problem_status").default("unknown"),
    fitStatus: text("fit_status").default("unknown"),
    authorityStatus: text("authority_status").default("unknown"),
    commercialsStatus: text("commercials_status").default("unknown"),
    timingStatus: text("timing_status").default("unknown"),
    nextStepStatus: text("next_step_status").default("unknown"),
    completenessScore: integer("completeness_score").default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("opportunity_qualification_deal_uidx").on(t.dealId)],
);

export const opportunityStageHistoryTable = pgTable("opportunity_stage_history", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  changeSource: text("change_source").default("user"),
  aiConfidence: integer("ai_confidence"),
  reason: text("reason"),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opportunityActionsTable = pgTable(
  "opportunity_actions",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id")
      .notNull()
      .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => productsTable.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    description: text("description").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: integer("priority").default(50),
    status: text("status").notNull().default("pending"),
    generatedBy: text("generated_by").default("ai"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("opportunity_actions_status_due_idx").on(t.status, t.dueAt),
    index("opportunity_actions_product_idx").on(t.productId),
  ],
);

export const opportunityCompetitorsTable = pgTable("opportunity_competitors", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type"),
  notes: text("notes"),
  evidence: text("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lostDealDetailsTable = pgTable(
  "lost_deal_details",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id")
      .notNull()
      .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    competitor: text("competitor"),
    notes: text("notes"),
    aiSuggestedReason: text("ai_suggested_reason"),
    userConfirmed: boolean("user_confirmed").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("lost_deal_details_deal_uidx").on(t.dealId)],
);

export const productOpportunitySettingsTable = pgTable(
  "product_opportunity_settings",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    autoCreateEnabled: boolean("auto_create_enabled").notNull().default(true),
    triggerBookMeeting: boolean("trigger_book_meeting").notNull().default(true),
    triggerInterested: boolean("trigger_interested").notNull().default(true),
    triggerPricing: boolean("trigger_pricing").notNull().default(false),
    requireNonRejectTier: boolean("require_non_reject_tier").notNull().default(true),
    autoStageMove: boolean("auto_stage_move").notNull().default(false),
    minStageConfidence: integer("min_stage_confidence").notNull().default(90),
    stallDays: integer("stall_days").notNull().default(14),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("product_opportunity_settings_product_uidx").on(t.productId)],
);

export const opportunityAgentAuditTable = pgTable(
  "opportunity_agent_audit",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id"),
    dealId: integer("deal_id"),
    leadId: integer("lead_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("opportunity_agent_audit_deal_idx").on(t.dealId, t.createdAt),
    index("opportunity_agent_audit_product_idx").on(t.productId, t.createdAt),
  ],
);
