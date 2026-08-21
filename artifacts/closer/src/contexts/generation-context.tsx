/**
 * Global generation context — keeps schedule generation state alive across
 * navigation so the user can freely move around the app while the server
 * builds their content calendar.
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export type GenerationStatus = {
  active: boolean
  message?: string
  step?: number
  total?: number
  done?: boolean
  competitors?: string[]
  brandColors?: string[]
  error?: string
}

export type GenerationState = {
  productId: number
  productName: string
  /** null while request is in-flight */
  status: GenerationStatus | null
  /** true while the POST is pending (before the server responds) */
  isStarting: boolean
  error: string | null
  navigateOnDone?: string
}

type GenerationContextValue = {
  state: GenerationState | null
  startGeneration: (
    productId: number,
    productName: string,
    startDate?: string,
    navigateOnDone?: string,
    styleGuide?: string,
    stylePreset?: string,
    assetUrls?: string[],
  ) => void
  dismiss: () => void
  /** true while generating for the given product (not yet done/errored) */
  isGeneratingFor: (productId: number) => boolean
}

export const GenerationContext = createContext<GenerationContextValue>({
  state: null,
  startGeneration: () => {},
  dismiss: () => {},
  isGeneratingFor: () => false,
})

export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GenerationState | null>(null)
  const qc = useQueryClient()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(
    (productId: number) => {
      stopPolling()
      const doFetch = async () => {
        try {
          const res = await fetch(
            `${BASE}/api/products/${productId}/social/generation-status`,
            { credentials: "include" },
          )
          if (!res.ok) return
          const data: GenerationStatus = await res.json()
          setState(prev => (prev ? { ...prev, status: data } : null))
          if (data.done || data.error) {
            stopPolling()
            qc.invalidateQueries({ queryKey: ["social-posts", productId] })
          }
        } catch {
          // network blip — keep polling
        }
      }
      doFetch()
      pollRef.current = setInterval(doFetch, 1500)
    },
    [qc, stopPolling],
  )

  const startGeneration = useCallback(
    (
      productId: number,
      productName: string,
      startDate?: string,
      navigateOnDone?: string,
      styleGuide?: string,
      stylePreset?: string,
      assetUrls?: string[],
    ) => {
      stopPolling()
      setState({ productId, productName, status: null, isStarting: true, error: null, navigateOnDone })

      fetch(`${BASE}/api/products/${productId}/social/generate-schedule`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, styleGuide, stylePreset, assetUrls: assetUrls ?? [] }),
      })
        .then(async res => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({ error: "Request failed" }))
            setState(prev =>
              prev
                ? {
                    ...prev,
                    isStarting: false,
                    error: (data as { error?: string }).error ?? "Generation failed",
                  }
                : null,
            )
            return
          }
          setState(prev => (prev ? { ...prev, isStarting: false } : null))
          startPolling(productId)
        })
        .catch(() => {
          setState(prev =>
            prev ? { ...prev, isStarting: false, error: "Network error" } : null,
          )
        })
    },
    [startPolling, stopPolling],
  )

  const dismiss = useCallback(() => {
    stopPolling()
    setState(null)
  }, [stopPolling])

  const isGeneratingFor = useCallback(
    (productId: number) =>
      state?.productId === productId &&
      !state?.status?.done &&
      !state?.error &&
      state?.status?.active !== false,
    [state],
  )

  // Cleanup on unmount (shouldn't happen but be safe)
  useEffect(() => () => stopPolling(), [stopPolling])

  return (
    <GenerationContext.Provider value={{ state, startGeneration, dismiss, isGeneratingFor }}>
      {children}
    </GenerationContext.Provider>
  )
}

export function useGeneration() {
  return useContext(GenerationContext)
}
