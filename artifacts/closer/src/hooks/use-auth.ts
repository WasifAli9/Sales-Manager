import { useQuery, useQueryClient } from '@tanstack/react-query'

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') || ''

export interface AppUser {
  id: string
  email: string
  /** 'owner' | 'member' */
  role: string
  name: string | null
  firstName: string | null
  lastName: string | null
  profileImageUrl: string | null
}

async function fetchCurrentUser(): Promise<AppUser | null> {
  const res = await fetch(`${BASE}/api/auth/user`, { credentials: 'include' })
  if (!res.ok) return null
  const data = await res.json() as { user: AppUser | null }
  return data.user ?? null
}

export const AUTH_QUERY_KEY = ['auth', 'user'] as const

export function useAuth() {
  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data,
  }
}

export function useAuthActions() {
  const qc = useQueryClient()

  const logout = async () => {
    await fetch(`${BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    qc.setQueryData(AUTH_QUERY_KEY, null)
    qc.clear()
    window.location.reload()
  }

  return { logout }
}
