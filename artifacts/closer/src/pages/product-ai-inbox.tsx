import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Inbox, Loader2, RefreshCw, Send, Settings2, BookOpen, Save,
} from "lucide-react"
import { useEffect, useState } from "react"
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

const TABS = [
  { id: "needs_attention", label: "Needs Attention" },
  { id: "ai_handled", label: "AI Handled" },
  { id: "interested", label: "Interested" },
  { id: "follow_up", label: "Follow-Up" },
  { id: "not_interested", label: "Not Interested" },
  { id: "unsubscribed", label: "Unsubscribed" },
  { id: "ooo", label: "Out of Office" },
  { id: "all", label: "All Replies" },
] as const

type InboxItem = {
  id: number
  subject: string | null
  sender: string
  snippet: string
  receivedAt: string
  processingStatus: string
  inboxBucket: string
  lead: { id: number; firstName: string; lastName: string; company: string | null; email: string | null } | null
  classification: string | null
  confidence: number | null
  summary: string | null
  recommendedAction: string | null
  buyingIntent: string | null
  draft: { id: number; status: string; body: string; subject: string | null } | null
}

export default function ProductAiInbox() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { data: product, isLoading } = useProductDetail(productId)
  const { toast } = useToast()
  const qc = useQueryClient()

  const [tab, setTab] = useState<string>("needs_attention")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [knowledgeOpen, setKnowledgeOpen] = useState(false)
  const [draftBody, setDraftBody] = useState("")
  const [draftSubject, setDraftSubject] = useState("")

  const inboxQuery = useQuery({
    queryKey: ["ai-inbox", productId, tab],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/ai-inbox?tab=${encodeURIComponent(tab)}`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load AI Inbox")
      return res.json() as Promise<{ items: InboxItem[]; counts: Record<string, number> }>
    },
    enabled: Number.isInteger(productId) && productId > 0,
    refetchInterval: 15_000,
  })

  const metricsQuery = useQuery({
    queryKey: ["ai-inbox-metrics", productId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/ai-inbox/metrics`, { credentials: "include" })
      if (!res.ok) throw new Error("metrics failed")
      return res.json() as Promise<{
        repliesReceived: number
        aiHandled: number
        needsAttention: number
        byClassification: Array<{ classification: string; count: number; avgConfidence: number }>
      }>
    },
    enabled: Number.isInteger(productId) && productId > 0,
  })

  const detailQuery = useQuery({
    queryKey: ["ai-inbox-detail", productId, selectedId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/ai-inbox/${selectedId}`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load reply")
      return res.json()
    },
    enabled: !!selectedId,
  })

  useEffect(() => {
    const d = detailQuery.data?.drafts?.[0]
    if (d) {
      setDraftBody(d.body ?? "")
      setDraftSubject(d.subject ?? "")
    } else {
      setDraftBody("")
      setDraftSubject("")
    }
  }, [detailQuery.data])

  const settingsQuery = useQuery({
    queryKey: ["ai-reply-settings", productId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/ai-reply-settings`, { credentials: "include" })
      if (!res.ok) throw new Error("settings failed")
      return (await res.json()).settings
    },
    enabled: settingsOpen,
  })

  const knowledgeQuery = useQuery({
    queryKey: ["reply-knowledge", productId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/reply-knowledge`, { credentials: "include" })
      if (!res.ok) throw new Error("knowledge failed")
      return (await res.json()).items as Array<{ id: number; category: string; title: string; content: string; url: string | null }>
    },
    enabled: knowledgeOpen,
  })

  const [settingsForm, setSettingsForm] = useState<Record<string, unknown>>({})
  useEffect(() => {
    if (settingsQuery.data) setSettingsForm(settingsQuery.data)
  }, [settingsQuery.data])

  const [knowForm, setKnowForm] = useState({ category: "product_fact", title: "", content: "", url: "" })

  const saveSettingsMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/ai-reply-settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settingsForm,
          bookingLink: settingsForm.bookingLink || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Save failed")
      return data
    },
    onSuccess: () => {
      toast({ title: "Reply settings saved" })
      setSettingsOpen(false)
      qc.invalidateQueries({ queryKey: ["ai-reply-settings", productId] })
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const addKnowledgeMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/reply-knowledge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(knowForm),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Save failed")
      return data
    },
    onSuccess: () => {
      setKnowForm({ category: "product_fact", title: "", content: "", url: "" })
      qc.invalidateQueries({ queryKey: ["reply-knowledge", productId] })
      toast({ title: "Knowledge entry added" })
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const draftMut = useMutation({
    mutationFn: async (inboundId: number) => {
      const res = await fetch(`${BASE}/api/products/${productId}/ai-inbox/${inboundId}/draft`, {
        method: "POST",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Draft failed")
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-inbox-detail", productId, selectedId] })
      toast({ title: "Draft generated" })
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const saveDraftMut = useMutation({
    mutationFn: async (draftId: number) => {
      const res = await fetch(`${BASE}/api/products/${productId}/ai-inbox/drafts/${draftId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draftBody, subject: draftSubject }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Save failed")
      return data
    },
    onSuccess: () => toast({ title: "Draft saved" }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const sendMut = useMutation({
    mutationFn: async (draftId: number) => {
      await saveDraftMut.mutateAsync(draftId)
      const res = await fetch(`${BASE}/api/products/${productId}/ai-inbox/drafts/${draftId}/send`, {
        method: "POST",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Send failed")
      return data
    },
    onSuccess: async () => {
      toast({ title: "Reply sent" })
      await qc.invalidateQueries({ queryKey: ["ai-inbox", productId] })
      await qc.invalidateQueries({ queryKey: ["ai-inbox-detail", productId, selectedId] })
      setSelectedId(null)
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const reprocessMut = useMutation({
    mutationFn: async (inboundId: number) => {
      const res = await fetch(`${BASE}/api/products/${productId}/ai-inbox/${inboundId}/process`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Reprocess failed")
    },
    onSuccess: async () => {
      toast({ title: "Reprocessed" })
      await qc.invalidateQueries({ queryKey: ["ai-inbox", productId] })
      await qc.invalidateQueries({ queryKey: ["ai-inbox-detail", productId, selectedId] })
    },
  })

  const items = inboxQuery.data?.items ?? []
  const counts = inboxQuery.data?.counts ?? {}
  const metrics = metricsQuery.data
  const detail = detailQuery.data
  const activeDraft = detail?.drafts?.[0]

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
          { label: "AI Inbox" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/products/${productId}`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to product
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Inbox className="h-5 w-5 text-teal-400" />
            AI Inbox
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Replies classified and actioned — you only handle what needs attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setKnowledgeOpen(true)}>
            <BookOpen className="h-3.5 w-3.5" /> Knowledge
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => inboxQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {metrics && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Replies (30d)" value={String(metrics.repliesReceived)} />
          <Metric label="Needs attention" value={String(metrics.needsAttention)} />
          <Metric label="AI handled" value={String(metrics.aiHandled)} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
              tab === t.id
                ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
                : "border-border text-muted-foreground hover:bg-muted/40",
            )}
          >
            {t.label}
            {counts[t.id] != null ? ` (${counts[t.id]})` : ""}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {inboxQuery.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No replies in this tab yet. Enable Resend Receiving on salesmanager@creativecloud.ai and subscribe the webhook to `email.received`.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/20"
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {item.lead
                        ? `${item.lead.firstName} ${item.lead.lastName}${item.lead.company ? ` – ${item.lead.company}` : ""}`
                        : item.sender}
                    </span>
                    {item.classification && (
                      <Badge variant="outline" className="text-[10px]">{item.classification}</Badge>
                    )}
                    {item.confidence != null && (
                      <span className="text-[10px] text-muted-foreground">{item.confidence}%</span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {item.summary || item.snippet || item.subject || "—"}
                  </p>
                  {item.recommendedAction && (
                    <p className="text-[11px] text-teal-300/90">Suggested: {item.recommendedAction}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review reply</DialogTitle>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : detail ? (
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Prospect</div>
                <div className="font-medium">
                  {detail.lead
                    ? `${detail.lead.firstName} ${detail.lead.lastName} · ${detail.lead.company || "—"}`
                    : detail.message.sender}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Reply received</div>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs">
                  {(detail.message.bodyText || "").slice(0, 2000) || "(no text body)"}
                </p>
              </div>
              {detail.analysis && (
                <div className="space-y-1 rounded-lg border border-teal-500/20 bg-teal-500/[0.04] p-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{detail.analysis.classification}</Badge>
                    <span className="text-xs text-muted-foreground">{detail.analysis.confidence}% confidence</span>
                    {detail.analysis.buyingIntent && (
                      <span className="text-xs text-muted-foreground">Intent: {detail.analysis.buyingIntent}</span>
                    )}
                  </div>
                  <p className="text-xs">{detail.analysis.summary}</p>
                  <p className="text-xs text-teal-300">{detail.analysis.recommendedAction}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => selectedId && reprocessMut.mutate(selectedId)}>
                  Reprocess
                </Button>
                <Button size="sm" variant="outline" onClick={() => selectedId && draftMut.mutate(selectedId)}>
                  Generate draft
                </Button>
              </div>
              {(activeDraft || draftBody) && (
                <div className="space-y-2">
                  <div className="text-xs uppercase text-muted-foreground">Suggested reply</div>
                  <Input value={draftSubject} onChange={e => setDraftSubject(e.target.value)} placeholder="Subject" />
                  <Textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={8} />
                  {activeDraft && activeDraft.status !== "sent" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => saveDraftMut.mutate(activeDraft.id)}>
                        <Save className="h-3.5 w-3.5" /> Save
                      </Button>
                      <Button size="sm" className="gap-1" disabled={sendMut.isPending} onClick={() => sendMut.mutate(activeDraft.id)}>
                        {sendMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Approve & Send
                      </Button>
                    </div>
                  )}
                  {activeDraft?.status === "sent" && (
                    <p className="text-xs text-emerald-400">Already sent</p>
                  )}
                </div>
              )}
              {detail.audit?.length > 0 && (
                <div>
                  <div className="mb-1 text-xs uppercase text-muted-foreground">Audit</div>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
                    {detail.audit.map((a: { id: number; eventType: string; createdAt: string }) => (
                      <li key={a.id}>{new Date(a.createdAt).toLocaleString()} — {a.eventType}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>AI Reply Settings</DialogTitle></DialogHeader>
          {settingsQuery.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="space-y-3 text-sm">
              {(
                [
                  ["autoProcessReplies", "Auto-process replies"],
                  ["autoPauseOnReply", "Pause sequence on reply"],
                  ["autoSendHighConfidence", "Auto-send high-confidence replies"],
                  ["autoHandleOoo", "Auto-handle Out of Office"],
                  ["autoHandleNotInterested", "Auto-handle Not Interested"],
                  ["autoAnswerProductQuestions", "Auto-answer product questions"],
                  ["autoAnswerPricing", "Auto-answer pricing"],
                  ["autoSendMeetingLink", "Auto-send meeting link"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm[key])}
                    onChange={e => setSettingsForm(s => ({ ...s, [key]: e.target.checked }))}
                  />
                </label>
              ))}
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Min confidence auto-send</span>
                <Input
                  type="number"
                  value={Number(settingsForm.minConfidenceAutoSend ?? 95)}
                  onChange={e => setSettingsForm(s => ({ ...s, minConfidenceAutoSend: Number(e.target.value) }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Booking link</span>
                <Input
                  value={String(settingsForm.bookingLink ?? "")}
                  onChange={e => setSettingsForm(s => ({ ...s, bookingLink: e.target.value }))}
                  placeholder="https://…"
                />
              </label>
              <Button size="sm" onClick={() => saveSettingsMut.mutate()} disabled={saveSettingsMut.isPending}>
                Save settings
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Reply knowledge base</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"
              value={knowForm.category}
              onChange={e => setKnowForm(f => ({ ...f, category: e.target.value }))}
            >
              <option value="product_fact">Product fact</option>
              <option value="pricing">Pricing</option>
              <option value="objection">Objection</option>
              <option value="asset">Asset / brochure</option>
              <option value="meeting">Meeting</option>
              <option value="other">Other</option>
            </select>
            <Input placeholder="Title" value={knowForm.title} onChange={e => setKnowForm(f => ({ ...f, title: e.target.value }))} />
            <Textarea placeholder="Approved content (facts only)" rows={4} value={knowForm.content} onChange={e => setKnowForm(f => ({ ...f, content: e.target.value }))} />
            <Input placeholder="URL (optional)" value={knowForm.url} onChange={e => setKnowForm(f => ({ ...f, url: e.target.value }))} />
            <Button size="sm" onClick={() => addKnowledgeMut.mutate()} disabled={!knowForm.title || !knowForm.content}>
              Add entry
            </Button>
            <ul className="space-y-2 border-t border-border pt-3">
              {(knowledgeQuery.data ?? []).map(k => (
                <li key={k.id} className="rounded-lg border border-border p-2 text-xs">
                  <div className="font-medium">[{k.category}] {k.title}</div>
                  <p className="text-muted-foreground">{k.content.slice(0, 200)}</p>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
