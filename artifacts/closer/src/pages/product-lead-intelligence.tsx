import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Brain, Building2, Filter, Loader2, Play, RefreshCw, Save, UserRound,
} from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useProductDetail } from "@/hooks/use-products"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

type LeadRow = {
  id: number
  firstName: string
  lastName: string
  email: string | null
  title: string | null
  company: string | null
  companyId: number | null
  website: string | null
  industry: string | null
  employeeCount: number | null
  location: string | null
  researchStatus: string | null
  icpScore: number | null
  contactScore: number | null
  buyingSignalScore: number | null
  priorityScore: number | null
  tier: string | null
  persona: string | null
  decisionRole: string | null
  recommendedCampaign: string | null
  recommendedSequenceId: number | null
  recommendationReason: string | null
  disqualified: boolean
}

type IntelligenceResponse = {
  leads: LeadRow[]
  progress: { total: number; pending: number; running: number; done: number; failed: number; researched: number }
  summary: {
    total: number
    scored: number
    avgIcp: number | null
    avgContact: number | null
    avgPriority: number | null
    tierCounts: { A: number; B: number; C: number; Reject: number }
  }
}

type IcpProfile = {
  targetIndustries: string[]
  employeeMin: number | null
  employeeMax: number | null
  targetGeographies: string[]
  targetRoles: string[]
  positiveCharacteristics: string[]
  negativeCharacteristics: string[]
  hardExclusions: Record<string, unknown>
}

function linesToList(value: string): string[] {
  return value.split(/\n|,/).map(s => s.trim()).filter(Boolean)
}

function listToLines(value: string[] | undefined): string {
  return (value ?? []).join("\n")
}

function tierBadge(tier: string | null) {
  if (!tier) return <Badge variant="outline" className="text-[10px]">—</Badge>
  const cls =
    tier === "A" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : tier === "B" ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
    : tier === "Reject" ? "bg-red-500/15 text-red-400 border-red-500/30"
    : "bg-muted text-muted-foreground"
  return <Badge className={cn("text-[10px] border", cls)}>{tier}</Badge>
}

function statusLabel(status: string | null) {
  if (!status) return "—"
  return status.replace(/_/g, " ")
}

export default function ProductLeadIntelligence() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { data: product, isLoading } = useProductDetail(productId)
  const { toast } = useToast()
  const qc = useQueryClient()

  const [q, setQ] = useState("")
  const [tier, setTier] = useState("")
  const [sort, setSort] = useState("priority")
  const [selected, setSelected] = useState<number[]>([])
  const [companyCardId, setCompanyCardId] = useState<number | null>(null)
  const [contactLeadId, setContactLeadId] = useState<number | null>(null)
  const [icpOpen, setIcpOpen] = useState(false)

  const queryKey = ["lead-intelligence", productId, q, tier, sort]
  const dataQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<IntelligenceResponse> => {
      const params = new URLSearchParams()
      if (q) params.set("q", q)
      if (tier) params.set("tier", tier)
      if (sort) params.set("sort", sort)
      const res = await fetch(`${BASE}/api/products/${productId}/lead-intelligence?${params}`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load lead intelligence")
      return res.json()
    },
    enabled: Number.isInteger(productId) && productId > 0,
    refetchInterval: (query) => {
      const p = query.state.data?.progress
      return p && (p.pending > 0 || p.running > 0) ? 5000 : false
    },
  })

  const icpQuery = useQuery({
    queryKey: ["icp-profile", productId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/icp-profile`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load ICP profile")
      const data = await res.json()
      return (data.profile ?? null) as (IcpProfile & { id: number }) | null
    },
    enabled: Number.isInteger(productId) && productId > 0,
  })

  const companyQuery = useQuery({
    queryKey: ["company-intelligence", productId, companyCardId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/companies/${companyCardId}/intelligence`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load company intelligence")
      return res.json()
    },
    enabled: !!companyCardId,
  })

  const contactQuery = useQuery({
    queryKey: ["contact-intelligence", contactLeadId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/leads/${contactLeadId}/intelligence`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load contact intelligence")
      return res.json()
    },
    enabled: !!contactLeadId,
  })

  const processMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/lead-intelligence/process`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 8 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Process failed")
      return data
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["lead-intelligence", productId] })
      toast({ title: `Processed ${data.processed ?? 0} companies` })
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const requeueMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/lead-intelligence/requeue`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Requeue failed")
      return data
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["lead-intelligence", productId] })
      toast({ title: `Queued ${data.queued} research jobs` })
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const assignMut = useMutation({
    mutationFn: async (leadIds: number[]) => {
      const res = await fetch(`${BASE}/api/products/${productId}/lead-intelligence/assign-campaigns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Assign failed")
      return data
    },
    onSuccess: (data) => toast({ title: data.message || "Campaigns approved" }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const [icpForm, setIcpForm] = useState({
    industries: "",
    geos: "",
    roles: "",
    positives: "",
    negatives: "",
    employeeMin: "",
    employeeMax: "",
    excludeBelow: "",
  })

  const openIcpEditor = () => {
    const p = icpQuery.data
    setIcpForm({
      industries: listToLines(p?.targetIndustries),
      geos: listToLines(p?.targetGeographies),
      roles: listToLines(p?.targetRoles),
      positives: listToLines(p?.positiveCharacteristics),
      negatives: listToLines(p?.negativeCharacteristics),
      employeeMin: p?.employeeMin != null ? String(p.employeeMin) : "",
      employeeMax: p?.employeeMax != null ? String(p.employeeMax) : "",
      excludeBelow: p?.hardExclusions && typeof (p.hardExclusions as any).employeeBelow === "number"
        ? String((p.hardExclusions as any).employeeBelow)
        : "",
    })
    setIcpOpen(true)
  }

  const saveIcpMut = useMutation({
    mutationFn: async () => {
      const body = {
        targetIndustries: linesToList(icpForm.industries),
        targetGeographies: linesToList(icpForm.geos),
        targetRoles: linesToList(icpForm.roles),
        positiveCharacteristics: linesToList(icpForm.positives),
        negativeCharacteristics: linesToList(icpForm.negatives),
        employeeMin: icpForm.employeeMin ? Number(icpForm.employeeMin) : null,
        employeeMax: icpForm.employeeMax ? Number(icpForm.employeeMax) : null,
        hardExclusions: {
          ...(icpForm.excludeBelow ? { employeeBelow: Number(icpForm.excludeBelow) } : {}),
        },
      }
      const res = await fetch(`${BASE}/api/products/${productId}/icp-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Save failed")
      return data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["icp-profile", productId] })
      setIcpOpen(false)
      toast({ title: "ICP profile saved" })
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const leads = dataQuery.data?.leads ?? []
  const progress = dataQuery.data?.progress
  const summary = dataQuery.data?.summary

  const allSelected = useMemo(
    () => leads.length > 0 && leads.every(l => selected.includes(l.id)),
    [leads, selected],
  )

  if (isLoading) {
    return <div className="space-y-4 p-4 animate-pulse"><div className="h-5 w-48 rounded bg-muted" /><div className="h-40 rounded-2xl bg-muted" /></div>
  }
  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-24 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${productId}` },
          { label: "Lead Intelligence" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/products/${productId}`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to product
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Brain className="h-5 w-5 text-violet-400" />
            Lead Intelligence
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Research, ICP fit, scoring, and campaign recommendations for imported leads.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openIcpEditor}>
            <Filter className="h-3.5 w-3.5" /> ICP profile
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={requeueMut.isPending} onClick={() => requeueMut.mutate()}>
            {requeueMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-queue research
          </Button>
          <Button size="sm" className="gap-1.5" disabled={processMut.isPending} onClick={() => processMut.mutate()}>
            {processMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Process now
          </Button>
        </div>
      </div>

      {progress && progress.total > 0 && (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              Research progress: {progress.done} / {progress.total} companies
            </span>
            <span className="text-xs text-muted-foreground">
              {progress.pending} pending · {progress.running} running · {progress.failed} failed
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-violet-400 transition-all"
              style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Leads" value={String(summary.total)} hint={`${summary.scored} scored`} />
          <SummaryCard label="Avg ICP" value={summary.avgIcp != null ? String(summary.avgIcp) : "—"} />
          <SummaryCard label="Avg Priority" value={summary.avgPriority != null ? String(summary.avgPriority) : "—"} />
          <SummaryCard
            label="Tiers"
            value={`A ${summary.tierCounts.A} · B ${summary.tierCounts.B}`}
            hint={`C ${summary.tierCounts.C} · Reject ${summary.tierCounts.Reject}`}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search name, company, title…"
          className="h-9 max-w-xs text-sm"
        />
        <select value={tier} onChange={e => setTier(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs">
          <option value="">All tiers</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
          <option value="Reject">Reject</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs">
          <option value="priority">Sort: Priority</option>
          <option value="icp">Sort: ICP</option>
          <option value="contact">Sort: Contact</option>
          <option value="name">Sort: Name</option>
        </select>
        {selected.length > 0 && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={assignMut.isPending}
              onClick={() => assignMut.mutate(selected)}
            >
              Approve campaigns ({selected.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={async () => {
                let created = 0
                for (const leadId of selected) {
                  const res = await fetch(`${BASE}/api/products/${productId}/opportunities/convert`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ leadId }),
                  })
                  if (res.ok) {
                    const data = await res.json()
                    if (data.created) created++
                  }
                }
                toast({ title: created ? `Created ${created} opportunit${created === 1 ? "y" : "ies"}` : "Already had active opportunities" })
              }}
            >
              Convert to opportunity ({selected.length})
            </Button>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {dataQuery.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No leads for this product yet. Import an Apollo CSV from the Leads page (with this product selected).
          </div>
        ) : (
          <table className="w-full min-w-[960px] text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => setSelected(e.target.checked ? leads.map(l => l.id) : [])}
                  />
                </th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">ICP</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Intent</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Pain / Campaign</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(lead.id)}
                      onChange={e => setSelected(curr => e.target.checked ? [...curr, lead.id] : curr.filter(id => id !== lead.id))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-left hover:underline" onClick={() => setContactLeadId(lead.id)}>
                      <div className="font-medium text-foreground">{lead.firstName} {lead.lastName}</div>
                      <div className="text-muted-foreground">{lead.title || "—"}</div>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {lead.companyId ? (
                      <button type="button" className="text-left hover:underline" onClick={() => setCompanyCardId(lead.companyId)}>
                        <div className="font-medium">{lead.company}</div>
                        <div className="text-muted-foreground">{lead.industry || lead.location || "—"}</div>
                      </button>
                    ) : (
                      <span>{lead.company || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{lead.icpScore ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{lead.contactScore ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{lead.buyingSignalScore ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{lead.priorityScore ?? "—"}</td>
                  <td className="px-3 py-2">{tierBadge(lead.tier)}</td>
                  <td className="px-3 py-2 max-w-[180px]">
                    <div className="truncate">{lead.recommendedCampaign?.replace(/_/g, " ") || "—"}</div>
                  </td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{statusLabel(lead.researchStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ICP editor */}
      <Dialog open={icpOpen} onOpenChange={setIcpOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ICP definition</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <label className="block space-y-1">Target industries (one per line)
              <Textarea rows={3} value={icpForm.industries} onChange={e => setIcpForm({ ...icpForm, industries: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">Employee min
                <Input value={icpForm.employeeMin} onChange={e => setIcpForm({ ...icpForm, employeeMin: e.target.value })} />
              </label>
              <label className="space-y-1">Employee max
                <Input value={icpForm.employeeMax} onChange={e => setIcpForm({ ...icpForm, employeeMax: e.target.value })} />
              </label>
            </div>
            <label className="block space-y-1">Target geographies
              <Textarea rows={2} value={icpForm.geos} onChange={e => setIcpForm({ ...icpForm, geos: e.target.value })} />
            </label>
            <label className="block space-y-1">Target roles
              <Textarea rows={2} value={icpForm.roles} onChange={e => setIcpForm({ ...icpForm, roles: e.target.value })} />
            </label>
            <label className="block space-y-1">Positive characteristics
              <Textarea rows={2} value={icpForm.positives} onChange={e => setIcpForm({ ...icpForm, positives: e.target.value })} />
            </label>
            <label className="block space-y-1">Negative characteristics
              <Textarea rows={2} value={icpForm.negatives} onChange={e => setIcpForm({ ...icpForm, negatives: e.target.value })} />
            </label>
            <label className="block space-y-1">Hard exclusion: employee count below
              <Input value={icpForm.excludeBelow} onChange={e => setIcpForm({ ...icpForm, excludeBelow: e.target.value })} />
            </label>
            <Button className="gap-1.5 w-full" disabled={saveIcpMut.isPending} onClick={() => saveIcpMut.mutate()}>
              {saveIcpMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save ICP profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Company card */}
      <Dialog open={!!companyCardId} onOpenChange={open => { if (!open) setCompanyCardId(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Company Intelligence
            </DialogTitle>
          </DialogHeader>
          {companyQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : companyQuery.data ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-lg">{companyQuery.data.company.name}</p>
                <p className="text-xs text-muted-foreground">{companyQuery.data.company.website || "No website"}</p>
              </div>
              <Section title="Overview">{companyQuery.data.intelligence?.summary || "Not researched yet."}</Section>
              <Section title="What they do">{companyQuery.data.intelligence?.whatTheyDo || "—"}</Section>
              <Section title="ICP fit">
                {companyQuery.data.icp
                  ? `Score ${companyQuery.data.icp.totalScore}${companyQuery.data.icp.disqualified ? " (disqualified)" : ""}. ${companyQuery.data.icp.reasoning || ""}`
                  : "—"}
              </Section>
              <Section title="Likely challenges">
                {(companyQuery.data.pains ?? []).length
                  ? companyQuery.data.pains.map((p: any) => (
                    <div key={p.id} className="text-xs">• {String(p.painCategory).replace(/_/g, " ")} ({p.confidence}%)</div>
                  ))
                  : "—"}
              </Section>
              <Section title="Buying signals">
                {(companyQuery.data.signals ?? []).length
                  ? companyQuery.data.signals.map((s: any) => (
                    <div key={s.id} className="text-xs">• {s.signalType}: {s.description}</div>
                  ))
                  : "None detected"}
              </Section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Contact card */}
      <Dialog open={!!contactLeadId} onOpenChange={open => { if (!open) setContactLeadId(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4" /> Contact Intelligence
            </DialogTitle>
          </DialogHeader>
          {contactQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : contactQuery.data ? (
            <div className="space-y-3 text-sm">
              <p className="font-semibold text-lg">
                {contactQuery.data.lead.firstName} {contactQuery.data.lead.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{contactQuery.data.lead.title}</p>
              <Section title="Persona">{contactQuery.data.contact?.persona || "—"}</Section>
              <Section title="Decision role">{contactQuery.data.contact?.estimatedDecisionRole || "—"}</Section>
              <Section title="Contact score">{contactQuery.data.contact?.contactScore ?? contactQuery.data.score?.contactScore ?? "—"}</Section>
              <Section title="Why this person">{contactQuery.data.contact?.whyThisPerson || "—"}</Section>
              <Section title="Opening angle">{contactQuery.data.contact?.suggestedOpeningAngle || "—"}</Section>
              <Section title="Scores">
                ICP {contactQuery.data.score?.icpScore ?? "—"} · Priority {contactQuery.data.score?.priorityScore ?? "—"} · Tier {contactQuery.data.score?.tier ?? "—"}
              </Section>
              <Section title="Recommended campaign">
                {contactQuery.data.recommendations?.[0]?.reason || "—"}
              </Section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-1 text-sm text-foreground whitespace-pre-wrap">{children}</div>
    </div>
  )
}
