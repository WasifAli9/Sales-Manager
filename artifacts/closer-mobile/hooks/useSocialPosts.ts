/**
 * Mobile social-post hooks — mirrors the web's use-social-posts.ts but
 * uses customFetch (bearer-token aware) instead of cookie credentials.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SocialPost = {
  id: number;
  productId: number;
  platform: 'instagram' | 'linkedin';
  scheduledDate: string;
  status: 'pending_approval' | 'approved' | 'posted' | 'failed' | 'rejected';
  caption: string | null;
  hashtags: string | null;
  theme: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  documentUrl: string | null;
  postUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Local YYYY-MM-DD for today. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Start date for schedule generation.
 * Current month → today (skip past days). Future months → the 1st.
 */
export function scheduleStartForMonth(monthKey: string): string {
  const today = todayISO();
  if (monthKey === today.slice(0, 7)) return today;
  return `${monthKey}-01`;
}

export function firstWeekdayOfMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).getDay();
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useSocialPosts(productId: number, month: string) {
  return useQuery<{ posts: SocialPost[] }>({
    queryKey: ['social-posts', productId, month],
    queryFn: () =>
      customFetch<{ posts: SocialPost[] }>(
        `/api/products/${productId}/social/posts?month=${month}`
      ),
    refetchInterval: (query) => {
      const posts = query.state.data?.posts ?? [];
      const generating = posts.some(
        (p) => !p.imageUrl && p.status === 'pending_approval'
      );
      return generating ? 5000 : false;
    },
    staleTime: 10_000,
  });
}

export function useGenerateSchedule(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (startDate: string) =>
      customFetch(`/api/products/${productId}/social/generate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts', productId] });
    },
  });
}

export function useApproveSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/social-posts/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
  });
}

export function useRejectSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/social-posts/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
  });
}

export function useRegenerateSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, theme }: { id: number; theme?: string }) =>
      customFetch(`/api/social-posts/${id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
  });
}
