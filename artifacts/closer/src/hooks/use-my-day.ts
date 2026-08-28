import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export type PlannerItem = {
  id: number
  title: string
  description: string | null
  executionType: string
  priorityScore: number
  priorityLevel: string
  estimatedMinutes: number | null
  whyItMatters: string | null
  status: string
  deepLink: string | null
  actionType: string | null
  productId: number | null
  productName: string | null
  dueAt: string | null
}

export type MyDayPayload = {
  plan: {
    id: number
    planDate: string
    availableMinutes: number
    mode: string | null
  }
  preferences: {
    defaultAvailableMinutes: number
    maximumTasks: number
    revenueFirst: boolean
    includeContent: boolean
    includeStrategy: boolean
  }
  oneThing: PlannerItem | null
  needsApproval: PlannerItem[]
  userActs: PlannerItem[]
  aiHandles: PlannerItem[]
  atRisk: PlannerItem[]
  critical: PlannerItem[]
  doneToday: PlannerItem[]
  summary: {
    approvals: number
    acts: number
    aiHandling: number
    atRisk: number
    critical: number
    completed: number
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function useMyDay(productId: number | null) {
  const qs = productId ? `?productId=${productId}` : ""
  return useQuery({
    queryKey: ["my-day", productId ?? "all"],
    queryFn: () => apiFetch<MyDayPayload>(`${BASE}/api/founder-planner/my-day${qs}`),
    refetchInterval: 60_000,
  })
}

export function useMyDayMutations(productId: number | null) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-day"] })

  const rebuild = useMutation({
    mutationFn: (body?: { availableMinutes?: number }) =>
      apiFetch(`${BASE}/api/founder-planner/rebuild`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, productId }),
      }),
    onSuccess: invalidate,
  })

  const complete = useMutation({
    mutationFn: (itemId: number) =>
      apiFetch(`${BASE}/api/founder-planner/items/${itemId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    onSuccess: invalidate,
  })

  const approve = useMutation({
    mutationFn: (itemId: number) =>
      apiFetch<{ item: PlannerItem; deepLink: string | null }>(`${BASE}/api/founder-planner/items/${itemId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    onSuccess: invalidate,
  })

  const snooze = useMutation({
    mutationFn: ({ itemId, days }: { itemId: number; days?: number }) =>
      apiFetch(`${BASE}/api/founder-planner/items/${itemId}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: days ?? 1 }),
      }),
    onSuccess: invalidate,
  })

  const delegate = useMutation({
    mutationFn: (itemId: number) =>
      apiFetch(`${BASE}/api/founder-planner/items/${itemId}/delegate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    onSuccess: invalidate,
  })

  const updatePrefs = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`${BASE}/api/founder-planner/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  })

  return { rebuild, complete, approve, snooze, delegate, updatePrefs }
}

export function useEndOfDayReview(enabled: boolean) {
  return useQuery({
    queryKey: ["my-day-eod"],
    queryFn: () =>
      apiFetch<{
        completed: Array<{ id: number; title: string; priorityLevel: string | null }>
        remaining: Array<{ id: number; title: string; priorityLevel: string | null }>
        tomorrowCandidates: Array<{ id: number; title: string; eventType: string }>
        message: string
      }>(`${BASE}/api/founder-planner/eod`),
    enabled,
  })
}
