import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Copy, Eye, Loader2, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useProductDetail } from "@/hooks/use-products"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { EmailSection } from "@/lib/email-sections"
import { STARTER_SECTIONS } from "@/components/email-builder/blocks/registry"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

type SavedSection = {
  id: number
  productId: number
  name: string
  description: string | null
  category: string | null
  tags: string[] | null
  sectionsJson: EmailSection[]
  updatedAt: string
}

async function fetchSavedSections(productId: number): Promise<SavedSection[]> {
  const res = await fetch(`${BASE}/api/products/${productId}/email-sections`, { credentials: "include" })
  if (!res.ok) throw new Error("Could not load saved sections")
  const data = await res.json()
  return data.sections ?? []
}

export default function ProductEmailSections() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { data: product, isLoading } = useProductDetail(productId)
  const { toast } = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<"mine" | "starters">("mine")
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)

  const sectionsQuery = useQuery({
    queryKey: ["email-saved-sections", productId],
    queryFn: () => fetchSavedSections(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  })

  const deleteMut = useMutation({
    mutationFn: async (sectionId: number) => {
      const res = await fetch(`${BASE}/api/email-sections/${sectionId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Could not delete section")
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["email-saved-sections", productId] })
      setPreviewHtml(null)
      setPreviewKey(null)
      toast({ title: "Section removed" })
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  const previewMut = useMutation({
    mutationFn: async ({ key, sections }: { key: string; sections: EmailSection[] }) => {
      const res = await fetch(`${BASE}/api/email-sections/render-preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, sections }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Preview failed")
      return { key, html: data.html as string }
    },
    onSuccess: ({ key, html }) => {
      setPreviewKey(key)
      setPreviewHtml(html)
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  const duplicateMut = useMutation({
    mutationFn: async (section: SavedSection) => {
      const res = await fetch(`${BASE}/api/products/${productId}/email-sections`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${section.name} (copy)`,
          description: section.description,
          category: section.category,
          tags: section.tags ?? [],
          sections: section.sectionsJson,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Duplicate failed")
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["email-saved-sections", productId] })
      toast({ title: "Section duplicated" })
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  if (isLoading) {
    return <div className="space-y-4 p-4 animate-pulse"><div className="h-5 w-48 rounded bg-muted" /><div className="h-36 rounded-2xl bg-muted" /></div>
  }
  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  const saved = sectionsQuery.data ?? []

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-24 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${productId}` },
          { label: "Email Settings", href: `/products/${productId}/email` },
          { label: "Email Sections" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/products/${productId}/email`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to email settings
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Email sections</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reusable blocks for the visual builder — headers, footers, CTAs, and more.
          </p>
        </div>
        <Link href={`/products/${productId}/email/sequences/new`}>
          <Button size="sm">Open sequence builder</Button>
        </Link>
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 max-w-xs">
        {(["mine", "starters"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize",
              tab === t ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {t === "mine" ? "My sections" : "Starter sections"}
          </button>
        ))}
      </div>

      {tab === "mine" && (
        <div className="space-y-3">
          {sectionsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : saved.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No saved sections yet. Build an email in a sequence and use <strong>Save as reusable</strong> in the visual builder.
            </div>
          ) : (
            saved.map(section => {
              const key = `saved-${section.id}`
              return (
                <div key={section.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold">{section.name}</h2>
                      {section.description && <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>}
                      {section.category && (
                        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {section.category}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8"
                        disabled={previewMut.isPending}
                        onClick={() => previewMut.mutate({ key, sections: section.sectionsJson })}
                      >
                        {previewMut.isPending && previewKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        Preview
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" disabled={duplicateMut.isPending} onClick={() => duplicateMut.mutate(section)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-destructive" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(section.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {previewKey === key && previewHtml && (
                    <div className="overflow-hidden rounded-xl border border-border bg-white">
                      <iframe title={`Preview ${section.name}`} srcDoc={previewHtml} className="h-[280px] w-full border-0" />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === "starters" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {STARTER_SECTIONS.map((starter, index) => {
            const key = `starter-${index}`
            return (
              <div key={key} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">{starter.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{starter.description}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={previewMut.isPending}
                  onClick={() => previewMut.mutate({ key, sections: starter.sections })}
                >
                  {previewMut.isPending && previewKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                  Preview
                </Button>
                {previewKey === key && previewHtml && (
                  <div className="overflow-hidden rounded-xl border border-border bg-white">
                    <iframe title={`Preview ${starter.name}`} srcDoc={previewHtml} className="h-[220px] w-full border-0" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
