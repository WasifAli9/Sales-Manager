import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export type ProductAsset = {
  id: number
  productId: number
  name: string
  type: string
  storageUrl: string
  createdAt: string
}

// ── List ──────────────────────────────────────────────────────────────────────
export function useProductAssets(productId: number) {
  return useQuery<ProductAsset[]>({
    queryKey: ["product-assets", productId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/assets`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to load assets")
      const { assets } = await res.json() as { assets: ProductAsset[] }
      return assets
    },
    enabled: productId > 0,
  })
}

// ── Upload ────────────────────────────────────────────────────────────────────
export function useUploadProductAsset(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name: string
      type: string
      imageBase64: string
      mimeType: string
    }) => {
      const res = await fetch(`${BASE}/api/products/${productId}/assets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Upload failed" })) as { error?: string }
        throw new Error(error ?? "Upload failed")
      }
      const { asset } = await res.json() as { asset: ProductAsset }
      return asset
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-assets", productId] })
    },
  })
}

// ── Delete ────────────────────────────────────────────────────────────────────
export function useDeleteProductAsset(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assetId: number) => {
      const res = await fetch(`${BASE}/api/products/${productId}/assets/${assetId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Delete failed")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-assets", productId] })
    },
  })
}
