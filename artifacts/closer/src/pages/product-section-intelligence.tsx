import { useParams } from "wouter"
import { useProductDetail } from "@/hooks/use-products"
import { Button } from "@/components/ui/button"
import {
  Globe, RefreshCw, BrainCircuit, Users, Zap, LayoutList,
  DollarSign, Swords, Loader2, Copy, Check, Linkedin,
} from "lucide-react"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetProductQueryKey } from "@workspace/api-client-react"
import { Breadcrumbs } from "@/components/breadcrumbs"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

async function triggerAnalyze(productId: number) {
  const res = await fetch(`${BASE}/api/products/${productId}/analyze`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Analysis failed" }))
    throw new Error((err as { error?: string }).error ?? "Analysis failed")
  }
  return res.json()
}

export default function ProductSectionIntelligence() {
  const params = useParams()
  const id = Number(params.id)
  const { data: product, isLoading } = useProductDetail(id)
  const queryClient = useQueryClient()
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      await triggerAnalyze(id)
      queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(id) })
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed")
    }
    setAnalyzing(false)
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-4 w-56 bg-muted rounded" />
        <div className="h-24 bg-muted rounded-2xl" />
        <div className="h-24 bg-muted rounded-2xl" />
      </div>
    )
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  const keyFeatures: string[] = (() => {
    if (!product.keyFeatures) return []
    try { return JSON.parse(product.keyFeatures) } catch { return [] }
  })()

  const hasIntel = !!(
    product.icp || product.valueProp || product.pricingModel ||
    product.competitorLandscape || product.linkedinFilter || keyFeatures.length
  )

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-5 px-4">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${id}` },
          { label: "Website Intelligence" },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="w-5 h-5 text-sky-400" />
            Website Intelligence
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scraped automatically from{" "}
            {product.websiteUrl ? (
              <a
                href={product.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {product.websiteUrl}
              </a>
            ) : (
              "your product website"
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnalyze}
          disabled={analyzing || !product.websiteUrl}
          className="h-9 px-3 text-xs gap-1.5 rounded-xl shrink-0"
          title={product.websiteUrl ? "Re-analyse website" : "No website URL set"}
        >
          {analyzing
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />}
          {analyzing ? "Analysing…" : hasIntel ? "Re-analyse" : "Analyse"}
        </Button>
      </div>

      {analyzeError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2">
          {analyzeError}
        </p>
      )}

      {analyzing && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Scraping and analysing…</p>
            <p className="text-xs text-muted-foreground">Takes 10–20 seconds</p>
          </div>
        </div>
      )}

      {!analyzing && hasIntel && (
        <div className="space-y-3">
          {product.icp && (
            <IntelCard icon={<Users className="w-4 h-4" />} label="Ideal Customer">
              {product.icp}
            </IntelCard>
          )}
          {product.valueProp && (
            <IntelCard icon={<Zap className="w-4 h-4" />} label="Value Proposition">
              {product.valueProp}
            </IntelCard>
          )}
          {keyFeatures.length > 0 && (
            <IntelCard icon={<LayoutList className="w-4 h-4" />} label="Key Features">
              <ul className="space-y-1 mt-1">
                {keyFeatures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5 shrink-0">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </IntelCard>
          )}
          {product.pricingModel && (
            <IntelCard icon={<DollarSign className="w-4 h-4" />} label="Pricing Model">
              {product.pricingModel}
            </IntelCard>
          )}
          {product.competitorLandscape && (
            <IntelCard icon={<Swords className="w-4 h-4" />} label="Competitor Landscape">
              {product.competitorLandscape}
            </IntelCard>
          )}
          {product.linkedinFilter && (
            <LinkedInFilterCard filter={product.linkedinFilter} />
          )}
          {product.websiteAnalyzedAt && (
            <p className="text-[10px] text-muted-foreground text-right">
              Last analysed {new Date(product.websiteAnalyzedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {!analyzing && !hasIntel && (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center space-y-4">
          <Globe className="w-10 h-10 text-muted-foreground/30 mx-auto" />
          <div>
            <p className="text-sm font-medium text-foreground">No intelligence captured yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {product.websiteUrl
                ? "Click Analyse to scrape your website and extract sales intelligence."
                : "Add a website URL to your product first, then run the analysis."}
            </p>
          </div>
          {product.websiteUrl && (
            <Button
              size="sm"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="gap-2 rounded-xl"
            >
              <BrainCircuit className="w-4 h-4" />
              Analyse Website Now
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function IntelCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-sm text-foreground leading-relaxed">{children}</div>
    </div>
  )
}

function LinkedInFilterCard({ filter }: { filter: string }) {
  const [copied, setCopied] = useState(false)

  const rows = filter.split("|").map(s => s.trim()).filter(Boolean).map(segment => {
    const colonIdx = segment.indexOf(":")
    if (colonIdx === -1) return { key: null, value: segment }
    return { key: segment.slice(0, colonIdx).trim(), value: segment.slice(colonIdx + 1).trim() }
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(filter).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded-2xl border border-[#0A66C2]/30 bg-[#0A66C2]/5 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Linkedin className="w-4 h-4 text-[#0A66C2]" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            LinkedIn Sales Navigator Filter
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/40"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            {row.key && (
              <span className="text-xs font-semibold text-[#0A66C2] shrink-0 pt-0.5 min-w-[90px]">
                {row.key}
              </span>
            )}
            <span className="text-xs text-foreground leading-relaxed">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
