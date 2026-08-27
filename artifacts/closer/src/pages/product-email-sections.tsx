import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Copy, Eye, Loader2, Pencil, Save, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useProductDetail } from "@/hooks/use-products"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { EmailSection } from "@/lib/email-sections"
import { STARTER_SECTIONS, newSectionId } from "@/components/email-builder/blocks/registry"
import { SectionSettingsPanel } from "@/components/email-builder/SectionSettingsPanel"
import { SECTION_CATALOG } from "@/components/email-builder/blocks/registry"

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

type EditDraft = {
  source: "saved" | "starter"
  savedId?: number
  name: string
  description: string
  category: string
  sections: EmailSection[]
  selectedIndex: number
}

async function fetchSavedSections(productId: number): Promise<SavedSection[]> {
  const res = await fetch(`${BASE}/api/products/${productId}/email-sections`, { credentials: "include" })
  if (!res.ok) throw new Error("Could not load saved sections")
  const data = await res.json()
  return data.sections ?? []
}

function cloneSections(sections: EmailSection[]): EmailSection[] {
  return sections.map(s => ({
    ...s,
    id: newSectionId(),
    content: { ...s.content },
    style: { ...s.style },
    savedSectionId: null,
  }))
}

function labelForType(type: EmailSection["type"]) {
  return SECTION_CATALOG.find(c => c.type === type)?.label ?? type
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
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [editPreviewHtml, setEditPreviewHtml] = useState<string | null>(null)

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

  const saveMut = useMutation({
    mutationFn: async (draft: EditDraft) => {
      if (draft.source === "saved" && draft.savedId) {
        const res = await fetch(`${BASE}/api/email-sections/${draft.savedId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            description: draft.description.trim() || null,
            category: draft.category || "custom",
            sections: draft.sections,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Could not update section")
        return { mode: "updated" as const }
      }

      const res = await fetch(`${BASE}/api/products/${productId}/email-sections`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          category: draft.category || "custom",
          sections: draft.sections,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not save section")
      return { mode: "created" as const }
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["email-saved-sections", productId] })
      setEditDraft(null)
      setEditPreviewHtml(null)
      setTab("mine")
      toast({ title: result.mode === "updated" ? "Section updated" : "Saved to My sections" })
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  useEffect(() => {
    if (!editDraft?.sections.length) {
      setEditPreviewHtml(null)
      return
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/api/email-sections/render-preview`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, sections: editDraft.sections }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && typeof data.html === "string") setEditPreviewHtml(data.html)
      } catch {
        // ignore live-preview failures while typing
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [editDraft?.sections, productId])

  const openSavedEditor = (section: SavedSection) => {
    setEditDraft({
      source: "saved",
      savedId: section.id,
      name: section.name,
      description: section.description ?? "",
      category: section.category ?? "custom",
      sections: cloneSections(section.sectionsJson),
      selectedIndex: 0,
    })
  }

  const openStarterEditor = (starter: (typeof STARTER_SECTIONS)[number]) => {
    setEditDraft({
      source: "starter",
      name: starter.name,
      description: starter.description,
      category: starter.category,
      sections: cloneSections(starter.sections),
      selectedIndex: 0,
    })
  }

  const updateSelectedSection = (patch: Partial<EmailSection>) => {
    setEditDraft(current => {
      if (!current) return current
      const index = current.selectedIndex
      return {
        ...current,
        sections: current.sections.map((s, i) => i === index ? { ...s, ...patch } : s),
      }
    })
  }

  if (isLoading) {
    return <div className="space-y-4 p-4 animate-pulse"><div className="h-5 w-48 rounded bg-muted" /><div className="h-36 rounded-2xl bg-muted" /></div>
  }
  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  const saved = sectionsQuery.data ?? []
  const selectedSection = editDraft?.sections[editDraft.selectedIndex] ?? null

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
              No saved sections yet. Edit a starter below, or build an email and use <strong>Save as reusable</strong>.
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
                      <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => openSavedEditor(section)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
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
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openStarterEditor(starter)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
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
                </div>
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

      <Dialog open={!!editDraft} onOpenChange={open => { if (!open) { setEditDraft(null); setEditPreviewHtml(null) } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editDraft?.source === "starter" ? "Customize starter section" : "Edit section"}</DialogTitle>
          </DialogHeader>

          {editDraft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Name
                  <Input value={editDraft.name} onChange={e => setEditDraft({ ...editDraft, name: e.target.value })} />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Category
                  <Input value={editDraft.category} onChange={e => setEditDraft({ ...editDraft, category: e.target.value })} />
                </label>
              </div>
              <label className="space-y-1 text-xs text-muted-foreground block">
                Description
                <Input value={editDraft.description} onChange={e => setEditDraft({ ...editDraft, description: e.target.value })} />
              </label>

              <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Blocks</p>
                  {editDraft.sections.map((section, index) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setEditDraft({ ...editDraft, selectedIndex: index })}
                      className={cn(
                        "w-full rounded-lg border px-2.5 py-2 text-left text-xs",
                        editDraft.selectedIndex === index ? "border-primary/40 bg-primary/10" : "border-border bg-card",
                      )}
                    >
                      {labelForType(section.type)}
                    </button>
                  ))}
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Settings</p>
                  {selectedSection ? (
                    <SectionSettingsPanel
                      section={selectedSection}
                      onChange={updateSelectedSection}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">Select a block to edit.</p>
                  )}
                </div>
              </div>

              {editPreviewHtml && (
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                  <iframe title="Live section preview" srcDoc={editPreviewHtml} className="h-[240px] w-full border-0" />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setEditDraft(null); setEditPreviewHtml(null) }}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="gap-1.5"
                  disabled={!editDraft.name.trim() || !editDraft.sections.length || saveMut.isPending}
                  onClick={() => saveMut.mutate(editDraft)}
                >
                  {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editDraft.source === "starter" ? "Save to My sections" : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
