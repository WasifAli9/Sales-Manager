import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Eye, Loader2, Sparkles, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useProductDetail } from "@/hooks/use-products"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

type DesignTemplate = {
  id: number
  productId: number
  name: string
  category: string
  designIntensity: number
  htmlShell: string
  isActive: boolean
  createdAt: string
}

const INTENSITY_LABEL: Record<number, string> = {
  1: "Personal / Plain",
  2: "Lightly branded",
  3: "Branded",
}

async function fetchTemplates(productId: number): Promise<DesignTemplate[]> {
  const res = await fetch(`${BASE}/api/products/${productId}/email-design-templates`, { credentials: "include" })
  if (!res.ok) throw new Error("Could not load templates")
  const data = await res.json()
  return data.templates ?? []
}

export default function ProductEmailTemplates() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { data: product, isLoading } = useProductDetail(productId)
  const { toast } = useToast()
  const qc = useQueryClient()
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<number | null>(null)

  const templatesQuery = useQuery({
    queryKey: ["email-design-templates", productId],
    queryFn: () => fetchTemplates(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  })

  const generateMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/email-design-templates/generate`, {
        method: "POST",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Generation failed")
      return data.templates as DesignTemplate[]
    },
    onSuccess: async (templates) => {
      await qc.invalidateQueries({ queryKey: ["email-design-templates", productId] })
      toast({ title: `Created ${templates.length} design template${templates.length === 1 ? "" : "s"}` })
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  const deleteMut = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await fetch(`${BASE}/api/email-design-templates/${templateId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Could not delete template")
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["email-design-templates", productId] })
      setPreviewHtml(null)
      setPreviewId(null)
      toast({ title: "Template removed" })
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  const previewMut = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await fetch(`${BASE}/api/email-design-templates/${templateId}/preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Preview failed")
      return { templateId, html: data.html as string }
    },
    onSuccess: ({ templateId, html }) => {
      setPreviewId(templateId)
      setPreviewHtml(html)
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  if (isLoading) {
    return <div className="space-y-4 p-4 animate-pulse"><div className="h-5 w-48 rounded bg-muted" /><div className="h-36 rounded-2xl bg-muted" /></div>
  }
  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  const templates = templatesQuery.data ?? []

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-24 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${productId}` },
          { label: "Email Settings", href: `/products/${productId}/email` },
          { label: "Design Templates" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Email design templates
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reusable layouts for {product.name}. Content stays separate; apply a template in a sequence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/products/${productId}/email`}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Brand settings
          </Link>
          <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="gap-2">
            {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate with AI
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4 text-xs leading-relaxed text-muted-foreground">
        AI creates three shells: personal/plain (best for cold outreach), lightly branded, and branded.
        Set your logo and colours on Email Settings first for better results.
      </div>

      {templatesQuery.isLoading ? (
        <div className="space-y-2">
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <Sparkles className="mx-auto h-9 w-9 text-violet-400/50" />
          <h2 className="mt-3 text-sm font-semibold">No design templates yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Generate a set tailored to this business, then apply one to a sequence or a single email.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {templates.map(template => (
              <div
                key={template.id}
                className={cn(
                  "rounded-2xl border bg-card p-4",
                  previewId === template.id ? "border-violet-500/40" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{template.name}</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {INTENSITY_LABEL[template.designIntensity] ?? `Level ${template.designIntensity}`}
                      {" · "}
                      {template.category}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 px-2"
                      disabled={previewMut.isPending}
                      onClick={() => previewMut.mutate(template.id)}
                    >
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove "${template.name}"?`)) deleteMut.mutate(template.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="min-h-[320px] overflow-hidden rounded-2xl border border-border bg-white">
            {previewHtml ? (
              <iframe title="Template preview" srcDoc={previewHtml} className="h-full min-h-[420px] w-full border-0" />
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-center text-xs text-muted-foreground">
                Select Preview on a template to see it with sample content and your brand colours.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
