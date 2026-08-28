import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  varchar,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const agentEventsTable = pgTable(
  "agent_events",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
    sourceAgent: text("source_agent").notNull(),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: text("source_entity_id"),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    commercialValue: integer("commercial_value").default(0),
    probability: integer("probability").default(50),
    urgency: integer("urgency").default(50),
    humanDependency: integer("human_dependency").default(50),
    riskScore: integer("risk_score").default(0),
    strategicScore: integer("strategic_score").default(0),
    confidence: integer("confidence").default(70),
    recommendedAction: text("recommended_action"),
    actionType: text("action_type"),
    /** ai_handles | user_approves | user_acts */
    executionType: text("execution_type").notNull().default("user_acts"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** open | resolved | superseded */
    status: text("status").notNull().default("open"),
    dedupeKey: text("dedupe_key"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_events_status_idx").on(t.status, t.createdAt),
    index("agent_events_product_idx").on(t.productId, t.status),
  ],
);

export const plannerPreferencesTable = pgTable(
  "planner_preferences",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    workingMode: text("working_mode").default("balanced"),
    defaultAvailableMinutes: integer("default_available_minutes").notNull().default(240),
    maximumTasks: integer("maximum_tasks").notNull().default(8),
    includeContent: boolean("include_content").notNull().default(false),
    includeStrategy: boolean("include_strategy").notNull().default(true),
    revenueFirst: boolean("revenue_first").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("planner_preferences_user_uidx").on(t.userId)],
);

export const dailyPlansTable = pgTable(
  "daily_plans",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    planDate: date("plan_date").notNull(),
    availableMinutes: integer("available_minutes").notNull().default(240),
    mode: text("mode").default("balanced"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    lastReplannedAt: timestamp("last_replanned_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("daily_plans_user_date_uidx").on(t.userId, t.planDate)],
);

export const plannerItemsTable = pgTable(
  "planner_items",
  {
    id: serial("id").primaryKey(),
    dailyPlanId: integer("daily_plan_id")
      .notNull()
      .references(() => dailyPlansTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    executionType: text("execution_type").notNull(),
    priorityScore: integer("priority_score").notNull().default(0),
    priorityLevel: text("priority_level").notNull().default("medium"),
    commercialValue: integer("commercial_value").default(0),
    estimatedMinutes: integer("estimated_minutes").default(15),
    whyItMatters: text("why_it_matters"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    plannedStart: timestamp("planned_start", { withTimezone: true }),
    plannedEnd: timestamp("planned_end", { withTimezone: true }),
    /** planned | in_progress | done | snoozed | delegated | dismissed | superseded */
    status: text("status").notNull().default("planned"),
    sourceEventIds: jsonb("source_event_ids").$type<number[]>().default([]),
    actionType: text("action_type"),
    deepLink: text("deep_link"),
    rank: integer("rank").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("planner_items_plan_status_idx").on(t.dailyPlanId, t.status),
    index("planner_items_user_idx").on(t.userId, t.status),
  ],
);

export const plannerOutcomesTable = pgTable("planner_outcomes", {
  id: serial("id").primaryKey(),
  plannerItemId: integer("planner_item_id")
    .notNull()
    .references(() => plannerItemsTable.id, { onDelete: "cascade" }),
  outcomeType: text("outcome_type").notNull(),
  notes: text("notes"),
  commercialResult: text("commercial_result"),
  resultingEventId: integer("resulting_event_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const plannerAuditTable = pgTable(
  "planner_audit",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id"),
    dailyPlanId: integer("daily_plan_id"),
    plannerItemId: integer("planner_item_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("planner_audit_user_idx").on(t.userId, t.createdAt)],
);
