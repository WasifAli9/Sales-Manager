import { useState } from "react"
import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowRight,
  Ban,
  ChevronRight,
  Eye,
  ListChecks,
  Loader2,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProductDetail } from "@/hooks/use-products"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

type SavedSequence = {
  id: number
  name: string
  description: string | null
  stepCount: number
  createdAt: string
}

type SequenceCampaign = {
  batchId: string | null
  campaignName: string | null
  sequenceId: number | null
  sequenceName: string | null
  subject: string
  total: number
  scheduled: number
  paused: number
  sent: number
  failed: number
  cancelled: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  openRate: number
  clickThroughRate: number
  clickToOpenRate: number
  lifecycle: "active" | "paused" | "stopped" | "completed"
  firstSendAt: string | null
  lastSendAt: string | null
  createdAt: string | null
}

type StepStat = {
  sequenceStepId: number | null
  position: number | null
  stepName: string | null
  subject: string
  total: number
  scheduled: number
  paused: number
  sent: number
  failed: number
  cancelled: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  openRate: number
  clickThroughRate: number
  clickToOpenRate: number
}

async function fetchSequences(productId: number): Promise<SavedSequence[]> {
  const response = await fetch(`${BASE}/api/email-sequences?productId=${productId}`, { credentials: "include" })
  if (!response.ok) throw new Error("Could not load email sequences")
  return response.json()
}

async function fetchActiveCampaigns(productId: number): Promise<SequenceCampaign[]> {
  const response = await fetch(
    `${BASE}/api/email-campaigns?productId=${productId}&sequenceOnly=1`,
    { credentials: "include" },
  )
  if (!response.ok) throw new Error("Could not load active sequences")
  return response.json()
}

async function fetchStepStats(batchId: string): Promise<StepStat[]> {
  const response = await fetch(`${BASE}/api/email-campaigns/${batchId}/steps`, { credentials: "include" })
  if (!response.ok) throw new Error("Could not load step stats")
  return response.json()
}

async function pauseCampaign(batchId: string): Promise<{ paused: number }> {
  const response = await fetch(`${BASE}/api/email-campaigns/${batchId}/pause`, {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) throw new Error("Could not pause sequence")
  return response.json()
}

async function resumeCampaign(batchId: string): Promise<{ resumed: number }> {
  const response = await fetch(`${BASE}/api/email-campaigns/${batchId}/resume`, {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) throw new Error("Could not resume sequence")
  return response.json()
}

async function stopCampaign(batchId: string): Promise<{ cancelled: number }> {
  const response = await fetch(`${BASE}/api/email-campaigns/${batchId}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!response.ok) throw new Error("Could not stop sequence")
  return response.json()
}

const LIFECYCLE_STYLES: Record<SequenceCampaign["lifecycle"], string> = {
  active: "text-emerald-400 bg-emerald-400/10",
  paused: "text-amber-400 bg-amber-400/10",
  stopped: "text-red-400 bg-red-400/10",
  completed: "text-muted-foreground bg-muted/50",
}

function ActiveSequenceCard({
  campaign,
  productId,
}: {
  campaign: SequenceCampaign
  productId: number
}) {
  const [expanded, setExpanded] = useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const batchId = campaign.batchId!

  const stepsQuery = useQuery({
    queryKey: ["campaign-steps", batchId],
    queryFn: () => fetchStepStats(batchId),
    enabled: expanded,
    refetchInterval: expanded ? 30_000 : false,
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["product-active-sequences", productId] }),
      queryClient.invalidateQueries({ queryKey: ["campaign-steps", batchId] }),
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] }),
    ])
  }

  const pauseMut = useMutation({
    mutationFn: () => pauseCampaign(batchId),
    onSuccess: (data) => {
      toast({ title: `Paused ${data.paused} pending email${data.paused === 1 ? "" : "s"}` })
      void invalidate()
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  const resumeMut = useMutation({
    mutationFn: () => resumeCampaign(batchId),
    onSuccess: (data) => {
      toast({ title: `Resumed ${data.resumed} email${data.resumed === 1 ? "" : "s"}` })
      void invalidate()
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  const stopMut = useMutation({
    mutationFn: () => stopCampaign(batchId),
    onSuccess: (data) => {
      toast({ title: `Stopped: ${data.cancelled} email${data.cancelled === 1 ? "" : "s"} cancelled` })
      void invalidate()
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  })

  const title = campaign.campaignName || campaign.sequenceName || campaign.subject
  const done = campaign.sent + campaign.failed + campaign.cancelled
  const progressPct = campaign.total > 0 ? Math.round((done / campaign.total) * 100) : 0
  const canPause = campaign.scheduled > 0
  const canResume = campaign.paused > 0
  const canStop = campaign.scheduled > 0 || campaign.paused > 0
  const busy = pauseMut.isPending || resumeMut.isPending || stopMut.isPending

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-start gap-3 p-4">
        <button type="button" onClick={() => setExpanded(v => !v)} className="min-w-0 flex-1 space-y-2 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Zap className="h-4 w-4 shrink-0 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", LIFECYCLE_STYLES[campaign.lifecycle])}>
              {campaign.lifecycle}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {campaign.sent} of {campaign.total} sent
                {campaign.scheduled > 0 ? ` · ${campaign.scheduled} queued` : ""}
                {campaign.paused > 0 ? ` · ${campaign.paused} paused` : ""}
              </span>
              <span className="tabular-nums">{progressPct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  campaign.lifecycle === "paused" ? "bg-amber-400" :
                  campaign.lifecycle === "stopped" ? "bg-red-400/70" :
                  "bg-violet-400",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {campaign.delivered > 0 && (
              <span className="rounded-full bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                {campaign.delivered} delivered
              </span>
            )}
            {campaign.opened > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                <Eye className="h-2.5 w-2.5" /> {campaign.openRate}% open
              </span>
            )}
            {campaign.clicked > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                <MousePointerClick className="h-2.5 w-2.5" /> {campaign.clickThroughRate}% CTR
              </span>
            )}
            {campaign.failed > 0 && (
              <span className="rounded-full bg-red-400/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                {campaign.failed} failed
              </span>
            )}
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            {canPause && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-amber-400 hover:bg-amber-400/10 hover:text-amber-300"
                disabled={busy}
                onClick={() => pauseMut.mutate()}
              >
                {pauseMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                Pause
              </Button>
            )}
            {canResume && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-emerald-400 hover:bg-emerald-400/10 hover:text-emerald-300"
                disabled={busy}
                onClick={() => resumeMut.mutate()}
              >
                {resumeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Resume
              </Button>
            )}
            {canStop && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-red-400 hover:bg-red-400/10 hover:text-red-300"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Stop this sequence? Remaining queued emails will be cancelled.")) {
                    stopMut.mutate()
                  }
                }}
              >
                {stopMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Stop
              </Button>
            )}
            <button type="button" onClick={() => setExpanded(v => !v)} className="p-1.5 text-muted-foreground" aria-label="Toggle email stats">
              <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/60 bg-muted/20">
          <div className="border-b border-border/40 px-4 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Per-email performance
            </p>
          </div>
          {stepsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : stepsQuery.isError ? (
            <p className="px-4 py-6 text-center text-xs text-destructive">Could not load email stats.</p>
          ) : (stepsQuery.data ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No emails in this run yet.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {(stepsQuery.data ?? []).map((step, index) => {
                const label = step.stepName?.trim() || `Email ${step.position ?? index + 1}`
                const stepDone = step.sent + step.failed + step.cancelled
                const stepPct = step.total > 0 ? Math.round((stepDone / step.total) * 100) : 0
                return (
                  <div key={step.sequenceStepId ?? `${step.subject}-${index}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground">
                          <span className="mr-1.5 text-muted-foreground">{step.position ?? index + 1}.</span>
                          {label}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{step.subject}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                          {step.sent}/{step.total} sent · {stepPct}%
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                          <Eye className="h-2.5 w-2.5" /> {step.openRate}% open
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                          <MousePointerClick className="h-2.5 w-2.5" /> {step.clickThroughRate}% CTR
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-violet-400/80" style={{ width: `${stepPct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TemplatesTab({ productId, productName }: { productId: number; productName: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const sequencesQuery = useQuery({
    queryKey: ["product-email-sequences", productId],
    queryFn: () => fetchSequences(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  })

  const deleteSequence = useMutation({
    mutationFn: async (sequenceId: number) => {
      const response = await fetch(`${BASE}/api/email-sequences/${sequenceId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!response.ok) throw new Error("Could not delete the sequence")
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product-email-sequences", productId] })
      toast({ title: "Sequence deleted" })
    },
    onError: (error: Error) => toast({ title: "Could not delete sequence", description: error.message, variant: "destructive" }),
  })

  const sequences = sequencesQuery.data ?? []

  return (
    <>
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">A focused template builder</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Create in a dedicated workspace with room to set your brief, adjust timing, edit every email, and save as one template.
            </p>
          </div>
        </div>
      </div>

      {sequencesQuery.isLoading ? (
        <div className="space-y-2">
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : sequencesQuery.isError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          Could not load saved sequences. Refresh and try again.
        </div>
      ) : sequences.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <Sparkles className="mx-auto h-9 w-9 text-violet-400/50" />
          <h2 className="mt-3 text-sm font-semibold">No saved sequences yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Start with a short brief, then use AI or a blank canvas to shape every email in the series.
          </p>
          <Link
            href={`/products/${productId}/email/sequences/new`}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 text-xs font-medium text-violet-300 hover:bg-violet-500/15"
          >
            <Plus className="h-3.5 w-3.5" />
            Build your first sequence
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saved templates</h2>
          {sequences.map(sequence => (
            <div key={sequence.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{sequence.name}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {sequence.stepCount} {sequence.stepCount === 1 ? "email" : "emails"}
                  </span>
                </div>
                {sequence.description && <p className="mt-1 truncate text-xs text-muted-foreground">{sequence.description}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Saved {new Date(sequence.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/products/${productId}/email/sequences/${sequence.id}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  disabled={deleteSequence.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete "${sequence.name}"? This cannot be undone.`)) deleteSequence.mutate(sequence.id)
                  }}
                  aria-label={`Delete ${sequence.name}`}
                >
                  {deleteSequence.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/products/${productId}/email/lists`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-4 transition-colors hover:bg-orange-500/[0.08]"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400"><ListChecks className="h-4 w-4" /></span>
          <span>
            <span className="block text-sm font-semibold text-foreground">Need an audience first?</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Create and manage contact lists for {productName}.</span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-orange-400" />
      </Link>
    </>
  )
}

function ActiveSequencesTab({ productId }: { productId: number }) {
  const campaignsQuery = useQuery({
    queryKey: ["product-active-sequences", productId],
    queryFn: () => fetchActiveCampaigns(productId),
    enabled: Number.isInteger(productId) && productId > 0,
    refetchInterval: 30_000,
  })

  const campaigns = (campaignsQuery.data ?? []).filter(c => c.batchId)

  if (campaignsQuery.isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      </div>
    )
  }

  if (campaignsQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        Could not load active sequences. Refresh and try again.
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
        <Zap className="mx-auto h-9 w-9 text-violet-400/50" />
        <h2 className="mt-3 text-sm font-semibold">No sequence runs yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Launch a saved template to an audience, then track progress, pause or stop it, and review open and click rates here.
        </p>
      </div>
    )
  }

  const running = campaigns.filter(c => c.lifecycle === "active" || c.lifecycle === "paused")
  const finished = campaigns.filter(c => c.lifecycle === "completed" || c.lifecycle === "stopped")

  return (
    <div className="space-y-5">
      {running.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">In progress</h2>
          {running.map(campaign => (
            <ActiveSequenceCard key={campaign.batchId} campaign={campaign} productId={productId} />
          ))}
        </div>
      )}
      {finished.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Finished</h2>
          {finished.map(campaign => (
            <ActiveSequenceCard key={campaign.batchId} campaign={campaign} productId={productId} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProductEmailSequences() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { data: product, isLoading: productLoading } = useProductDetail(productId)
  const [tab, setTab] = useState<"templates" | "active">("templates")

  if (productLoading) {
    return <div className="space-y-4 p-4 animate-pulse"><div className="h-5 w-48 rounded bg-muted" /><div className="h-36 rounded-2xl bg-muted" /></div>
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-24 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${productId}` },
          { label: "Email Settings", href: `/products/${productId}/email` },
          { label: "Sequences" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Email sequences
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Build templates and track live runs for {product.name}.
          </p>
        </div>
        {tab === "templates" && (
          <Link
            href={`/products/${productId}/email/sequences/new`}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create sequence
          </Link>
        )}
      </div>

      <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setTab("templates")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "templates" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Templates
        </button>
        <button
          type="button"
          onClick={() => setTab("active")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Active Sequences
        </button>
      </div>

      {tab === "templates" ? (
        <TemplatesTab productId={productId} productName={product.name} />
      ) : (
        <ActiveSequencesTab productId={productId} />
      )}
    </div>
  )
}
