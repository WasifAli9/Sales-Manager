import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  useListProductDocuments,
  useCreateProductDocument,
  useCreateProductStrategyDocument,
  useDeleteProductDocument,
} from "@workspace/api-client-react"
import { getListProductDocumentsQueryKey } from "@workspace/api-client-react"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export function useProductDocuments(productId: number) {
  return useListProductDocuments(productId)
}

export function useProductDocumentMutations(productId: number) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListProductDocumentsQueryKey(productId) })

  const create = useCreateProductDocument({
    mutation: { onSuccess: invalidate },
  })

  const createStrategyDocument = useCreateProductStrategyDocument({
    mutation: { onSuccess: invalidate },
  })

  const remove = useDeleteProductDocument({
    mutation: { onSuccess: invalidate },
  })

  // File upload + record creation — two-step: presign → PUT → POST document
  const uploadFile = async (
    productId: number,
    file: File,
  ): Promise<void> => {
    // 1. Request presigned URL
    const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    })
    if (!urlRes.ok) throw new Error("Failed to get upload URL")
    const { uploadURL, objectPath } = (await urlRes.json()) as { uploadURL: string; objectPath: string }

    // 2. Upload file directly to GCS
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    })
    if (!putRes.ok) throw new Error("Failed to upload file")

    // 3. Record document in DB
    const docRes = await fetch(`${BASE}/api/products/${productId}/documents`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        storageKey: objectPath,
        mimeType: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
      }),
    })
    if (!docRes.ok) throw new Error("Failed to save document record")

    invalidate()
  }

  return { create, createStrategyDocument, remove, uploadFile }
}
