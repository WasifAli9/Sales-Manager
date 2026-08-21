import { z } from "zod"
import { ActivityCategory } from "@workspace/api-client-react"

export const addActivitySchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.enum([ActivityCategory.SELL, ActivityCategory.CX, ActivityCategory.BUILD, ActivityCategory.ADMIN]),
  effortMinutes: z.coerce.number().min(1).default(30),
  delegateTo: z.string().optional(),
})
export type AddActivityForm = z.infer<typeof addActivitySchema>

export const reflectionSchema = z.object({
  wentWell: z.string().min(1),
  wentWrong: z.string().min(1),
  improvements: z.string().min(1),
  energy: z.coerce.number().min(1).max(5)
})
export type ReflectionForm = z.infer<typeof reflectionSchema>

export const productSchema = z.object({
  name: z.string().min(1, "Name required"),
  tagline: z.string().optional(),
  description: z.string().optional(),
  targetMarket: z.string().optional(),
  status: z.enum(["active", "paused", "idea", "launching"]).default("active"),
  websiteUrl: z.string().url("Enter a valid URL (https://...)").optional().or(z.literal(""))
})
export type ProductForm = z.infer<typeof productSchema>

export const goalSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(["revenue", "activity", "thirty_day", "platform", "charity"]),
  metric: z.string().min(1),
  targetValue: z.coerce.number().min(0.1),
  currentValue: z.coerce.number().default(0),
  unit: z.enum(["currency", "count", "percent"]),
  productId: z.coerce.number().optional(),
  platform: z.string().optional(),
})
export type GoalForm = z.infer<typeof goalSchema>

export const resourceSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["enrichment", "outreach", "content", "video", "scheduling", "ai", "webinar", "other"]),
  status: z.enum(["active", "trial", "considering", "dropped"]).default("active"),
  monthlyCost: z.coerce.number().optional(),
  automates: z.string().optional(),
  notes: z.string().optional()
})
export type ResourceForm = z.infer<typeof resourceSchema>
