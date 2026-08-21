import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getTodayStr } from "@/lib/date"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export interface DueReview {
  id: number
  productId: number
  productName: string
  contactName: string
  companyName: string | null
  value: string
  stage: string
  nextReviewDate: string
}

async function fetchDueReviews(date: string): Promise<DueReview[]> {
  const res = await fetch(`${BASE}/api/pipeline/reviews-due?date=${date}`, {
    credentials: "include",
  })
  if (!res.ok) return []
  return res.json()
}

export function useDueReviews() {
  const today = getTodayStr()
  const dueReviews = useQuery({
    queryKey: ["pipeline-reviews-due", today],
    queryFn: () => fetchDueReviews(today),
    staleTime: 1000 * 60 * 5,
  })
  return { dueReviews, today }
}

export function useMarkReviewed() {
  const qc = useQueryClient()
  const today = getTodayStr()

  const markReviewed = async (dealId: number, nextReviewDate: string | null) => {
    await fetch(`${BASE}/api/pipeline/${dealId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nextReviewDate }),
    })
    qc.invalidateQueries({ queryKey: ["pipeline-reviews-due", today] })
    qc.invalidateQueries({ queryKey: ["pipeline"] })
  }

  return { markReviewed }
}
