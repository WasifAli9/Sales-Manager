import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Loader2, Sparkles, CheckCircle2 } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useProductDetail } from "@/hooks/use-products"
import { useToast } from "@/hooks/use-toast"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

const STAGES = [
  "interested", "discovery", "demo", "qualified", "proposal", "decision", "negotiation", "won", "lost",
]

export default function ProductOpportunityDetail() {
  const { id, dealId: dealIdParam } = useParams<{ id: string; dealId: string }>()
  const productId = Number(id)
  const dealId = Number(dealIdParam)
  const { data: product } = useProductDetail(productId)
  const { toast } = useToast()
  const qc = useQueryClient()
  const [lostReason, setLostReason] = useState("")
  const [stakeholder, setStakeholder] = useState({ name: "", role: "" })
  const [objection, setObjection] = useState("")

  const detailQuery = useQuery({
    queryKey: ["opportunity", productId, dealId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/${dealId}`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load opportunity")
      return res.json()
    },
    enabled: productId > 0 && dealId > 0,
  })

  const aiMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/${dealId}/ai-summary`, {
        method: "POST",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "AI summary failed")
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunity", productId, dealId] })
      toast({ title: "Deal summary updated" })
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const stageMut = useMutation({
    mutationFn: async (stage: string) => {
      const body: Record<string, string> = { stage }
      if (stage === "lost") body.lostReason = lostReason || "Not specified"
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/${dealId}/stage`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Stage change failed")
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunity", productId, dealId] })
      toast({ title: "Stage updated" })
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const contactMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/${dealId}/contacts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: stakeholder.name, stakeholderRole: stakeholder.role }),
      })
      if (!res.ok) throw new Error("Could not add stakeholder")
    },
    onSuccess: () => {
      setStakeholder({ name: "", role: "" })
      qc.invalidateQueries({ queryKey: ["opportunity", productId, dealId] })
    },
  })

  const objectionMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/${dealId}/objections`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: objection }),
      })
      if (!res.ok) throw new Error("Could not add objection")
    },
    onSuccess: () => {
      setObjection("")
      qc.invalidateQueries({ queryKey: ["opportunity", productId, dealId] })
    },
  })

  const painMut = useMutation({
    mutationFn: async (confirmed: boolean) => {
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/${dealId}/pain`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryPain: data?.intelligence?.primaryPain,
          confirmed,
        }),
      })
      if (!res.ok) throw new Error("Could not update pain")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opportunity", productId, dealId] }),
  })

  const data = detailQuery.data
  const deal = data?.deal

  if (detailQuery.isLoading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }
  if (!deal) return <div className="p-4 text-muted-foreground">Opportunity not found</div>

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-24 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product?.name ?? "Product", href: `/products/${productId}` },
          { label: "Pipeline", href: `/pipeline/${productId}` },
          { label: deal.contactName },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/pipeline/${productId}`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to pipeline
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{deal.companyName || deal.contactName}</h1>
          <p className="text-xs text-muted-foreground">{deal.contactName} · {deal.stage} · {deal.probability}% · {deal.health}</p>
        </div>
        <Button size="sm" className="gap-1.5" disabled={aiMut.isPending} onClick={() => aiMut.mutate()}>
          {aiMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          AI summary
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="ARR" value={deal.arr ?? deal.value ?? "0"} />
        <Stat label="Probability" value={`${deal.probability}%`} />
        <Stat label="Health" value={String(deal.health ?? "—")} />
        <Stat label="Attention" value={String(deal.attentionScore ?? 0)} />
      </div>

      {data.intelligence && (
        <Section title="AI Deal Summary">
          <p className="text-sm">{data.intelligence.summary || "No summary yet — generate one."}</p>
          {data.intelligence.dealStrategy && (
            <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Strategy:</span> {data.intelligence.dealStrategy}</p>
          )}
          {data.intelligence.recommendedNextAction && (
            <p className="mt-2 text-xs text-teal-300">Next: {data.intelligence.recommendedNextAction}</p>
          )}
          {data.intelligence.stageRecommendation && (
            <p className="mt-1 text-xs text-muted-foreground">
              Stage suggestion: {data.intelligence.stageRecommendation}
              {data.intelligence.stageRecommendationConfidence != null ? ` (${data.intelligence.stageRecommendationConfidence}%)` : ""}
            </p>
          )}
          {data.intelligence.primaryPain && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Pain: {data.intelligence.primaryPain}</Badge>
              <Badge variant="outline">{data.intelligence.painSeverity}</Badge>
              {data.intelligence.painSeverity !== "confirmed" && (
                <Button size="sm" variant="outline" className="h-7" onClick={() => painMut.mutate(true)}>Confirm pain</Button>
              )}
            </div>
          )}
        </Section>
      )}

      <Section title="Stage">
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => stageMut.mutate(s)}
              className={`rounded-lg border px-2 py-1 text-[11px] capitalize ${deal.stage === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
        {deal.stage !== "lost" && (
          <div className="mt-3 flex gap-2">
            <Input placeholder="Lost reason (required when marking Lost)" value={lostReason} onChange={e => setLostReason(e.target.value)} />
          </div>
        )}
      </Section>

      <Section title="Qualification">
        <QualificationEditor productId={productId} dealId={dealId} qualification={data.qualification} onSaved={() => qc.invalidateQueries({ queryKey: ["opportunity", productId, dealId] })} />
      </Section>

      <Section title="Stakeholders">
        <ul className="mb-3 space-y-1 text-xs">
          {(data.contacts ?? []).map((c: { id: number; name: string | null; stakeholderRole: string | null }) => (
            <li key={c.id}>{c.name || "—"} · {c.stakeholderRole || "role n/a"}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Name" value={stakeholder.name} onChange={e => setStakeholder(s => ({ ...s, name: e.target.value }))} />
          <Input placeholder="Role (e.g. decision maker)" value={stakeholder.role} onChange={e => setStakeholder(s => ({ ...s, role: e.target.value }))} />
          <Button size="sm" onClick={() => contactMut.mutate()} disabled={!stakeholder.name}>Add</Button>
        </div>
      </Section>

      <Section title="Objections & Risks">
        <ul className="mb-2 space-y-1 text-xs">
          {(data.objections ?? []).map((o: { id: number; description: string | null; status: string }) => (
            <li key={o.id}>{o.description} <Badge variant="outline" className="text-[10px]">{o.status}</Badge></li>
          ))}
        </ul>
        <ul className="mb-3 space-y-1 text-xs text-amber-300/90">
          {(data.risks ?? []).filter((r: { status: string }) => r.status === "open").map((r: { id: number; riskType: string; description: string | null }) => (
            <li key={r.id}>{r.riskType}: {r.description}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Textarea rows={2} placeholder="New objection…" value={objection} onChange={e => setObjection(e.target.value)} />
          <Button size="sm" onClick={() => objectionMut.mutate()} disabled={!objection.trim()}>Add</Button>
        </div>
      </Section>

      <Section title="Inherited context">
        {data.leadScore && <p className="text-xs">Lead tier: {data.leadScore.tier} · ICP {data.leadScore.icpScore} · Contact {data.leadScore.contactScore}</p>}
        {data.contactIntelligence && <p className="text-xs mt-1">Persona: {data.contactIntelligence.persona} · {data.contactIntelligence.estimatedDecisionRole}</p>}
        {(data.replies ?? []).slice(0, 3).map((r: { message: { id: number; subject: string | null }; analysis?: { classification?: string; summary?: string } }) => (
          <p key={r.message.id} className="mt-1 text-xs text-muted-foreground">
            Reply {r.analysis?.classification || "—"}: {r.analysis?.summary || r.message.subject}
          </p>
        ))}
      </Section>

      <Section title="Timeline">
        <ul className="space-y-2 text-xs">
          {(data.activities ?? []).map((a: { id: number; kind: string; content: string; createdAt: string }) => (
            <li key={a.id} className="border-l-2 border-border pl-3">
              <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
              <span className="mx-1">·</span>
              <span className="capitalize">{a.kind}</span>
              <p>{a.content}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Audit">
        <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
          {(data.audit ?? []).map((a: { id: number; eventType: string; createdAt: string }) => (
            <li key={a.id}>{new Date(a.createdAt).toLocaleString()} — {a.eventType}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold capitalize tabular-nums">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function QualificationEditor({
  productId, dealId, qualification, onSaved,
}: {
  productId: number
  dealId: number
  qualification: Record<string, string | number | null> | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const fields = [
    ["problemStatus", "Problem"],
    ["fitStatus", "Fit"],
    ["authorityStatus", "Authority"],
    ["commercialsStatus", "Commercials"],
    ["timingStatus", "Timing"],
    ["nextStepStatus", "Next step"],
  ] as const
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const [k] of fields) init[k] = String(qualification?.[k] ?? "unknown")
    return init
  })

  const save = async () => {
    const res = await fetch(`${BASE}/api/products/${productId}/opportunities/${dealId}/qualification`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      toast({ title: "Save failed", variant: "destructive" })
      return
    }
    toast({ title: "Qualification saved" })
    onSaved()
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Completeness: {qualification?.completenessScore ?? 0}%</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <label key={key} className="text-xs">
            <span className="text-muted-foreground">{label}</span>
            <select
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2"
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            >
              <option value="unknown">Unknown</option>
              <option value="known">Known</option>
              <option value="confirmed">Confirmed</option>
              <option value="gap">Gap</option>
            </select>
          </label>
        ))}
      </div>
      <Button size="sm" className="gap-1" onClick={save}><CheckCircle2 className="h-3.5 w-3.5" /> Save qualification</Button>
    </div>
  )
}
