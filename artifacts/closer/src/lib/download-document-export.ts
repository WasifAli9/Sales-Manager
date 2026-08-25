const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export async function downloadDocumentExport(
  productId: number,
  docId: number,
  format: "pdf" | "docx",
) {
  const res = await fetch(
    `${BASE}/api/products/${productId}/documents/${docId}/export?format=${format}`,
    { credentials: "include" },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || `Failed to download ${format.toUpperCase()}`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match?.[1] ?? `strategy.${format}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
