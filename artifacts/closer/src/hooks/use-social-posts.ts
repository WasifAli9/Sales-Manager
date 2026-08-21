import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export type SocialPost = {
  id: number
  productId: number
  platform: "instagram" | "linkedin"
  scheduledDate: string
  status: "pending_approval" | "approved" | "posted" | "failed" | "rejected"
  caption: string | null
  hashtags: string | null
  theme: string | null
  imagePrompt: string | null
  imageUrl: string | null
  videoUrl: string | null
  documentUrl: string | null
  platformPostId: string | null
  postUrl: string | null
  errorMessage: string | null
  generatedAt: string | null
  approvedAt: string | null
  postedAt: string | null
  createdAt: string
}

export type SocialAccount = {
  id: number
  productId: number
  platform: "instagram" | "linkedin"
  accountId: string | null
  accountName: string | null
  connected: boolean
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...options })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }))
    throw new Error((data as { error?: string }).error ?? "Request failed")
  }
  return res.json()
}

// ── Saved style ───────────────────────────────────────────────────────────────

export type SavedStyle = {
  styleGuide: string | null
  stylePreset: string | null
}

export function useSavedStyle(productId: number) {
  return useQuery<SavedStyle>({
    queryKey: ["social-style", productId],
    queryFn: () => apiFetch(`${BASE}/api/products/${productId}/social/style`),
    staleTime: 60_000,
  })
}

export function useClearSavedStyle(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch(`${BASE}/api/products/${productId}/social/style`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-style", productId] })
    },
  })
}

export function useSocialPosts(productId: number, month?: string) {
  return useQuery<{ posts: SocialPost[] }>({
    queryKey: ["social-posts", productId, month],
    queryFn: () =>
      apiFetch(
        `${BASE}/api/products/${productId}/social/posts${month ? `?month=${month}` : ""}`
      ),
    refetchInterval: (query) => {
      // Poll while images are still generating
      const posts = query.state.data?.posts ?? []
      const generating = posts.some(p => !p.imageUrl && p.status === "pending_approval")
      return generating ? 5000 : false
    },
    staleTime: 10_000,
  })
}

export function useSocialAccounts(productId: number) {
  return useQuery<{ accounts: SocialAccount[] }>({
    queryKey: ["social-accounts", productId],
    queryFn: () => apiFetch(`${BASE}/api/products/${productId}/social/accounts`),
  })
}

export function useSocialAuthConfig() {
  return useQuery<{ linkedin: boolean; instagram: boolean }>({
    queryKey: ["social-auth-config"],
    queryFn: () => apiFetch(`${BASE}/api/social-auth/config`),
    staleTime: 60_000,
  })
}

export function useGenerateSchedule(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (startDate?: string) =>
      apiFetch(`${BASE}/api/products/${productId}/social/generate-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-posts", productId] })
    },
  })
}

export function useApproveSocialPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: number) =>
      apiFetch(`${BASE}/api/social-posts/${postId}/approve`, { method: "POST" }),
    onSuccess: (_data, postId) => {
      qc.invalidateQueries({ queryKey: ["social-posts"] })
    },
  })
}

export function useRejectSocialPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: number) =>
      apiFetch(`${BASE}/api/social-posts/${postId}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function useRegenerateSocialPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, theme }: { id: number; theme?: string }) =>
      apiFetch(`${BASE}/api/social-posts/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function useMoveSocialPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      apiFetch(`${BASE}/api/social-posts/${id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function useUpdateSocialPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, caption, hashtags, videoUrl }: {
      id: number; caption: string; hashtags: string; videoUrl?: string | null
    }) =>
      apiFetch(`${BASE}/api/social-posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, hashtags, videoUrl }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function useUploadPostImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => {
      const fd = new FormData()
      fd.append("image", file)
      return apiFetch(`${BASE}/api/social-posts/${id}/upload-image`, { method: "POST", body: fd })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function useUploadPostDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => {
      const fd = new FormData()
      fd.append("document", file)
      return apiFetch(`${BASE}/api/social-posts/${id}/upload-document`, { method: "POST", body: fd })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function usePostNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: number) =>
      apiFetch(`${BASE}/api/social-posts/${postId}/post-now`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function useDeleteSocialPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: number) =>
      apiFetch(`${BASE}/api/social-posts/${postId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function useDeleteMonthPosts(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (month: string) =>
      apiFetch(`${BASE}/api/products/${productId}/social/posts?month=${month}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  })
}

export function useSaveAccount(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ platform, accessToken, accountId, accountName }: {
      platform: string; accessToken: string; accountId: string; accountName: string
    }) =>
      apiFetch(`${BASE}/api/products/${productId}/social/accounts/${platform}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, accountId, accountName }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-accounts", productId] }),
  })
}

export function useDisconnectAccount(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (platform: string) =>
      apiFetch(`${BASE}/api/products/${productId}/social/accounts/${platform}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-accounts", productId] }),
  })
}

// ── Generation progress ───────────────────────────────────────────────────────
export type GenerationStatus = {
  active: boolean
  message?: string
  step?: number
  total?: number
  done?: boolean
  currentImage?: number    // which image is being generated
  totalImages?: number     // total images to generate
  currentTheme?: string    // theme label for current image
  hasPendingImages?: boolean // posts still need images (DB-backed, survives restarts)
  competitors?: string[]
  brandColors?: string[]
  error?: string
}

export function useGenerationStatus(productId: number, enabled: boolean) {
  return useQuery<GenerationStatus>({
    queryKey: ["generation-status", productId],
    queryFn: () =>
      apiFetch(`${BASE}/api/products/${productId}/social/generation-status`),
    enabled,
    refetchInterval: enabled ? 1500 : false,
    staleTime: 0,
  })
}

export function useResumeImages(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch(`${BASE}/api/products/${productId}/social/resume-images`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["generation-status", productId] })
    },
  })
}

export function useStopGeneration(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch(`${BASE}/api/products/${productId}/social/stop-generation`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["generation-status", productId] })
    },
  })
}
