import { Link, useParams } from "wouter"
import { useProductDetail } from "@/hooks/use-products"
import { useProductDetailData, useProductDetailMutations } from "@/hooks/use-product-detail"
import { useProductDocumentMutations } from "@/hooks/use-product-documents"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { BrainCircuit, CheckCircle2, CircleAlert, FileText, RefreshCw, Target } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useState } from "react"
import { Breadcrumbs } from "@/components/breadcrumbs"

const STRATEGIST_KINDS = [
  { id: "icp",         label: "Ideal Customer" },
  { id: "competitors", label: "Competitors" },
  { id: "value_prop",  label: "Value Prop" },
  { id: "gtm",         label: "Go-to-Market" },
  { id: "cadence",     label: "Sales Cadence" },
]

const strategistLabel = (kind: string) =>
  STRATEGIST_KINDS.find(item => item.id === kind)?.label ?? kind

export default function ProductSectionStrategist() {
  const params = useParams()
  const id = Number(params.id)
  const { data: product, isLoading: prodLoad } = useProductDetail(id)
  const { analyses } = useProductDetailData(id)
  const { createStrategyDocument } = useProductDocumentMutations(id)
  const [createdDocument, setCreatedDocument] = useState<{ id: number; name: string } | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)

  if (prodLoad || analyses.isLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-4 w-56 bg-muted rounded" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  const completedKinds = new Set<string>(
    (analyses.data ?? [])
      .map(analysis => analysis.kind)
      .filter(kind => STRATEGIST_KINDS.some(item => item.id === kind)),
  )
  const missingKinds = STRATEGIST_KINDS.filter(kind => !completedKinds.has(kind.id))
  const completedCount = completedKinds.size
  const readyForDocument = missingKinds.length === 0

  const handleCreateDocument = () => {
    setDocumentError(null)
    setCreatedDocument(null)
    createStrategyDocument.mutate(
      { id },
      {
        onSuccess: document => setCreatedDocument({ id: document.id, name: document.name }),
        onError: () => setDocumentError("The strategy document could not be created. Refresh the analyses and try again."),
      },
    )
  }

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-5 px-4">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${id}` },
          { label: "The Strategist" },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Target className="w-5 h-5 text-violet-400" />
          The Strategist
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          AI-generated sales strategy — run each analysis to get tailored insights.
        </p>
      </div>

      <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-foreground">Strategy document readiness</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Complete each Strategist analysis to turn these insights into one saved sales strategy.
            </p>
            <div className="mt-3 flex items-center gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={completedCount} aria-label={`${completedCount} of 5 Strategist analyses complete`}>
              {STRATEGIST_KINDS.map(kind => (
                <span
                  key={kind.id}
                  className={`h-1.5 flex-1 rounded-full ${completedKinds.has(kind.id) ? "bg-violet-400" : "bg-muted"}`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs font-medium text-foreground">
              {completedCount} of {STRATEGIST_KINDS.length} analyses complete
              {!readyForDocument && <span className="font-normal text-muted-foreground"> · Next: {missingKinds.map(kind => strategistLabel(kind.id)).join(", ")}</span>}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[218px]">
            <Button
              className="min-h-[42px] gap-2"
              onClick={handleCreateDocument}
              disabled={!readyForDocument || createStrategyDocument.isPending}
            >
              {createStrategyDocument.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {createStrategyDocument.isPending ? "Creating document…" : "Create Strategy Document"}
            </Button>
            {!readyForDocument && (
              <p className="text-center text-[11px] text-muted-foreground">
                Complete {missingKinds.length} more {missingKinds.length === 1 ? "analysis" : "analyses"} to unlock.
              </p>
            )}
          </div>
        </div>

        {createdDocument && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              {createdDocument.name} has been saved in Documents.
            </span>
            <Link
              href={`/products/${id}/documents?document=${createdDocument.id}`}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-400/10"
            >
              Open document
              <FileText className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {documentError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {documentError}
          </div>
        )}
      </section>

      {/* Strategy cards */}
      <div className="space-y-3">
        {STRATEGIST_KINDS.map(kind => {
          const analysis = analyses.data?.find(a => a.kind === kind.id)
          return (
            <StrategistCard
              key={kind.id}
              productId={id}
              kind={kind.id as any}
              label={kind.label}
              analysis={analysis}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── StrategistCard ─────────────────────────────────────────────────────────────
function StrategistCard({
  productId,
  kind,
  label,
  analysis,
}: {
  productId: number
  kind: any
  label: string
  analysis?: any
}) {
  const { runStrategist } = useProductDetailMutations(productId)
  const [open, setOpen] = useState(false)
  const [research, setResearch] = useState("")

  const handleRun = () => {
    runStrategist.mutate(
      { id: productId, data: { kind, pastedResearch: research || undefined } },
      { onSuccess: () => setOpen(false) },
    )
  }

  const renderContent = () => {
    if (!analysis) return null

    const humanLabel = (k: string) =>
      k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

    const renderScalar = (v: unknown): React.ReactNode => {
      if (typeof v === "string") return v
      if (typeof v === "number" || typeof v === "boolean") return String(v)
      return null
    }

    const renderObjectCard = (obj: Record<string, unknown>, idx: number) => (
      <div key={idx} className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
        {Object.entries(obj).map(([k, v]) => {
          if (typeof v === "string" && v.length > 60) {
            return (
              <div key={k}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
                  {humanLabel(k)}
                </p>
                <p className="text-sm text-foreground/90 leading-relaxed">{v}</p>
              </div>
            )
          }
          const scalar = renderScalar(v)
          if (scalar !== null) {
            return (
              <div key={k} className="flex gap-2 items-baseline flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                  {humanLabel(k)}
                </span>
                <span className="text-sm text-foreground/80">{scalar}</span>
              </div>
            )
          }
          return null
        })}
      </div>
    )

    const renderValue = (k: string, v: unknown, topLevel = false): React.ReactNode => {
      if (typeof v === "string") {
        return (
          <div key={k} className={topLevel ? "" : "flex gap-2 flex-wrap items-baseline"}>
            {topLevel
              ? <p className="text-sm text-foreground/85 leading-relaxed">{v}</p>
              : <>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                    {humanLabel(k)}
                  </span>
                  <span className="text-sm text-foreground/80">{v}</span>
                </>}
          </div>
        )
      }
      if (Array.isArray(v)) {
        const allStrings = v.every(item => typeof item === "string")
        if (allStrings) {
          return (
            <ul className="space-y-1.5 pl-0">
              {(v as string[]).map((item, i) => (
                <li key={i} className="flex gap-2 items-start text-sm text-foreground/80">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <div className="space-y-2">
            {v.map((item, i) =>
              item && typeof item === "object" && !Array.isArray(item)
                ? renderObjectCard(item as Record<string, unknown>, i)
                : <div key={i} className="text-sm text-foreground/80 pl-4 border-l-2 border-primary/30">
                    {renderScalar(item)}
                  </div>,
            )}
          </div>
        )
      }
      if (v && typeof v === "object") {
        return renderObjectCard(v as Record<string, unknown>, 0)
      }
      return null
    }

    try {
      const parsed =
        typeof analysis.content === "string" ? JSON.parse(analysis.content) : analysis.content
      return (
        <div className="mt-4 pt-4 border-t border-border space-y-5 text-sm">
          {analysis.grounded === false && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-xl text-xs font-semibold border border-destructive/20">
              ⚠ Ungrounded AI output — verify before acting.
            </div>
          )}
          {Object.entries(parsed).map(([k, v]: [string, unknown]) => {
            const body = renderValue(k, v, typeof v === "string")
            if (body === null) return null
            return (
              <div key={k} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary/80">
                  {humanLabel(k)}
                </h3>
                {body}
              </div>
            )
          })}
        </div>
      )
    } catch {
      const raw =
        typeof analysis.content === "string"
          ? analysis.content
          : JSON.stringify(analysis.content, null, 2)
      return (
        <div className="mt-4 pt-4 border-t border-border space-y-1.5">
          {raw.split("\n").map((line: string, i: number) => {
            if (line.startsWith("# "))
              return <h2 key={i} className="text-base font-bold mt-2">{line.slice(2)}</h2>
            if (line.startsWith("## "))
              return <h3 key={i} className="text-sm font-semibold text-primary/80 mt-2 uppercase tracking-wider">{line.slice(3)}</h3>
            if (line.startsWith("- ") || line.startsWith("* "))
              return (
                <div key={i} className="flex gap-2 items-start text-sm text-foreground/80">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                  <span className="leading-relaxed">{line.slice(2)}</span>
                </div>
              )
            if (!line.trim()) return <div key={i} className="h-1" />
            return <p key={i} className="text-sm text-foreground/80 leading-relaxed">{line}</p>
          })}
        </div>
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="cursor-pointer hover:border-violet-500/40 transition-colors bg-card group">
          <CardContent className="p-4 flex justify-between items-center min-h-[64px]">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  analysis ? "bg-violet-500/20 text-violet-400" : "bg-muted text-muted-foreground"
                }`}
              >
                {analysis ? <CheckIcon className="w-4 h-4" /> : <BrainCircuit className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-sm truncate">{label}</h4>
                <p className="text-xs text-muted-foreground truncate">
                  {analysis ? "Analysis ready" : "Not generated"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 shrink-0 ml-2"
            >
              {analysis ? "View" : "Run"}
            </Button>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex justify-between items-center pr-6 gap-2">
            <span className="truncate">{label} Strategy</span>
            {analysis && (
              <span className="text-xs font-mono text-muted-foreground font-normal shrink-0">
                Model: {analysis.modelUsed}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">{analysis && renderContent()}</div>
        <div className="pt-4 mt-2 border-t border-border shrink-0">
          {kind === "competitors" && (
            <div className="mb-4">
              <label className="text-xs font-bold uppercase text-muted-foreground mb-2 block">
                Grounding Research (Optional)
              </label>
              <Textarea
                placeholder="Paste competitor URLs, pricing pages, or notes here..."
                value={research}
                onChange={e => setResearch(e.target.value)}
                className="text-xs min-h-[64px]"
              />
            </div>
          )}
          <Button
            variant={analysis ? "outline" : "default"}
            className="w-full gap-2 min-h-[44px]"
            onClick={handleRun}
            disabled={runStrategist.isPending}
          >
            {runStrategist.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <BrainCircuit className="w-4 h-4" />
            )}
            {runStrategist.isPending
              ? "Generating Strategy..."
              : analysis
              ? "Regenerate"
              : `Run ${label} AI`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
