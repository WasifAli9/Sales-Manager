import { useParams, Link } from "wouter"
import { useProductDetail } from "@/hooks/use-products"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ChevronRight, Globe, Kanban, BarChart3,
  FileText, Mail, Sparkles, Loader2, Pencil, Save, ListChecks, ArrowDownUp, Palette, LayoutTemplate,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetProductQueryKey, useUpdateProduct } from "@workspace/api-client-react"
import { Breadcrumbs } from "@/components/breadcrumbs"

// ── Section tile definitions ─────────────────────────────────────────────────
const SECTIONS = [
  {
    key: "intelligence",
    getHref: (id: number) => `/products/${id}/intelligence`,
    Icon: Globe,
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-400",
    hoverBorder: "hover:border-sky-500/30",
    hoverBg: "hover:bg-sky-500/5",
    chevronHover: "group-hover:text-sky-400",
    title: "Website Intelligence",
    description: "ICP, value prop, pricing & competitor landscape",
  },
  {
    key: "pipeline",
    getHref: (id: number) => `/pipeline/${id}`,
    Icon: Kanban,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    hoverBorder: "hover:border-amber-500/30",
    hoverBg: "hover:bg-amber-500/5",
    chevronHover: "group-hover:text-amber-400",
    title: "Pipeline",
    description: "Deals, stages, and close dates",
  },
  {
    key: "targets",
    getHref: (id: number) => `/targets/${id}`,
    Icon: BarChart3,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    hoverBorder: "hover:border-emerald-500/30",
    hoverBg: "hover:bg-emerald-500/5",
    chevronHover: "group-hover:text-emerald-400",
    title: "Sales Targets",
    description: "Monthly targets & actuals by revenue line",
  },
  {
    key: "documents",
    getHref: (id: number) => `/products/${id}/documents`,
    Icon: FileText,
    iconBg: "bg-slate-500/10",
    iconColor: "text-slate-400",
    hoverBorder: "hover:border-slate-500/30",
    hoverBg: "hover:bg-slate-500/5",
    chevronHover: "group-hover:text-slate-400",
    title: "Documents",
    description: "Sales materials, decks & resources",
  },
  {
    key: "email",
    getHref: (id: number) => `/products/${id}/email`,
    Icon: Mail,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-400",
    hoverBorder: "hover:border-orange-500/30",
    hoverBg: "hover:bg-orange-500/5",
    chevronHover: "group-hover:text-orange-400",
    title: "Email Settings",
    description: "Sender identity, signature & unsubscribe footer",
  },
  {
    key: "email_templates",
    getHref: (id: number) => `/products/${id}/email/templates`,
    Icon: Palette,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    hoverBorder: "hover:border-violet-500/30",
    hoverBg: "hover:bg-violet-500/5",
    chevronHover: "group-hover:text-violet-400",
    title: "Email Templates",
    description: "AI branded layouts to apply across sequences",
  },
  {
    key: "email_sections",
    getHref: (id: number) => `/products/${id}/email/sections`,
    Icon: LayoutTemplate,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    hoverBorder: "hover:border-emerald-500/30",
    hoverBg: "hover:bg-emerald-500/5",
    chevronHover: "group-hover:text-emerald-400",
    title: "Email Sections",
    description: "Reusable headers, footers & blocks for the visual builder",
  },
  {
    key: "social",
    getHref: (id: number) => `/products/${id}/social`,
    Icon: Sparkles,
    iconBg: "bg-pink-500/10",
    iconColor: "text-pink-400",
    hoverBorder: "hover:border-pink-500/30",
    hoverBg: "hover:bg-pink-500/5",
    chevronHover: "group-hover:text-pink-400",
    title: "Social Media",
    description: "Content calendar & automated post generation",
  },
  {
    key: "email_sequences",
    getHref: (id: number) => `/products/${id}/email/sequences`,
    Icon: ArrowDownUp,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    hoverBorder: "hover:border-violet-500/30",
    hoverBg: "hover:bg-violet-500/5",
    chevronHover: "group-hover:text-violet-400",
    title: "Email Sequences",
    description: "AI-assisted templates, cadence & campaign launch",
  },
  {
    key: "contact_lists",
    getHref: (id: number) => `/products/${id}/email/lists`,
    Icon: ListChecks,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-400",
    hoverBorder: "hover:border-orange-500/30",
    hoverBg: "hover:bg-orange-500/5",
    chevronHover: "group-hover:text-orange-400",
    title: "Contact Lists",
    description: "Named, reusable campaign audiences from your leads",
  },
] as const

// ── Hub page ──────────────────────────────────────────────────────────────────
export default function ProductDetail() {
  const params = useParams()
  const id = Number(params.id)
  const { data: product, isLoading } = useProductDetail(id)

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded" />
        <div className="h-28 bg-muted rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-5 px-4">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: "Portfolio", href: "/products" }, { label: product.name }]} />

      {/* Product header */}
      <div className="rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground break-words leading-tight">
              {product.name}
            </h1>
            {product.tagline && (
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed line-clamp-2">
                {product.tagline}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <Badge
              variant={product.status === "active" ? "default" : "secondary"}
              className="capitalize"
            >
              {product.status}
            </Badge>
            <EditProductDialog product={product} productId={id} />
          </div>
        </div>
      </div>

      {/* Section tiles */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {SECTIONS.map(({ key, getHref, Icon, iconBg, iconColor, hoverBorder, hoverBg, chevronHover, title, description }) => (
          <Link key={key} href={getHref(id)} className="group">
            <div
              className={`flex min-h-[76px] items-center gap-3 rounded-2xl border border-border bg-card p-3.5 ${hoverBorder} ${hoverBg} transition-colors cursor-pointer`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors ${chevronHover}`} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Edit product dialog ────────────────────────────────────────────────────────
export function EditProductDialog({ product, productId }: { product: any; productId: number }) {
  const qc = useQueryClient()
  const updateProduct = useUpdateProduct()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", websiteUrl: "", tagline: "", status: "active" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = () => {
    setForm({
      name: product.name ?? "",
      websiteUrl: product.websiteUrl ?? "",
      tagline: product.tagline ?? "",
      status: product.status ?? "active",
    })
    setError(null)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Product name is required"); return }
    setSaving(true); setError(null)
    try {
      await updateProduct.mutateAsync({
        id: productId,
        data: {
          name: form.name.trim(),
          websiteUrl: form.websiteUrl.trim() || undefined,
          tagline: form.tagline.trim() || undefined,
          status: form.status as any,
        },
      })
      await qc.invalidateQueries({ queryKey: getGetProductQueryKey(productId) })
      setOpen(false)
    } catch {
      setError("Failed to save — please try again")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) setOpen(false) }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
          onClick={handleOpen}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Product name *</label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="My SaaS"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Website URL</label>
            <Input
              value={form.websiteUrl}
              onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
              placeholder="https://yourproduct.com"
              type="url"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tagline</label>
            <Input
              value={form.tagline}
              onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
              placeholder="One-line description"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} className="flex-1 h-11 rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 rounded-xl gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
