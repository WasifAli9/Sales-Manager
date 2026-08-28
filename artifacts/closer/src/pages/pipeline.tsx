import { useState } from "react"
import { useParams, Link } from "wouter"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useProductDetail } from "@/hooks/use-products"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Plus, Trash2, Loader2, TrendingUp,
  User, Building2, CalendarDays, ChevronDown, ChevronUp,
  Pencil, Target, FileText, Phone, Mail, Users, Video, MessageSquare
} from "lucide-react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { toGBP, formatGBP, formatInCurrency, CURRENCIES } from "@/lib/currency"
import { useToast } from "@/hooks/use-toast"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

// ── types ──────────────────────────────────────────────────────────────────
const STAGES = [
  { id: "interested",  label: "Interested",  color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  { id: "discovery",   label: "Discovery",   color: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  { id: "demo",        label: "Demo",        color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  { id: "qualified",   label: "Qualified",   color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { id: "proposal",    label: "Proposal",    color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  { id: "decision",    label: "Decision",    color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  { id: "negotiation", label: "Negotiation", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { id: "won",         label: "Won",         color: "bg-green-500/20 text-green-300 border-green-500/30" },
  { id: "lost",        label: "Lost",        color: "bg-red-500/20 text-red-300 border-red-500/30" },
] as const

type StageId = (typeof STAGES)[number]["id"]

const ACTIVITY_KINDS = [
  { id: "note",    label: "Note",    Icon: FileText,      color: "text-slate-400" },
  { id: "call",    label: "Call",    Icon: Phone,         color: "text-green-400" },
  { id: "email",   label: "Email",   Icon: Mail,          color: "text-blue-400" },
  { id: "meeting", label: "Meeting", Icon: Users,         color: "text-violet-400" },
  { id: "demo",    label: "Demo",    Icon: Video,         color: "text-amber-400" },
] as const
interface Deal {
  id: number
  productId: number
  contactName: string
  companyName: string | null
  value: string
  currency?: string
  frequency?: string // monthly | annual
  stage: string
  probability: number
  health?: string | null
  arr?: string | null
  expectedCloseDate: string | null
  nextReviewDate: string | null
  notes: string | null
  createdAt: string
}

/** Annualise a deal value: monthly × 12, annual as-is */
function annualValue(val: number, frequency: string | undefined) {
  return frequency === "annual" ? val : val * 12
}

interface Activity {
  id: number
  dealId: number
  kind: ActivityKind
  content: string
  createdAt: string
}
function stageInfo(stageId: string) {
  return STAGES.find(s => s.id === stageId) ?? STAGES[0]
}

function ProductContactListDialog({ open, onClose, productId }: { open: boolean; onClose: () => void; productId: number }) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const qc = useQueryClient()

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Give the list a name", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const leadsResponse = await fetch(`${BASE}/api/leads?productId=${productId}`, { credentials: "include" })
      if (!leadsResponse.ok) throw new Error("Could not load product leads")
      const leads = await leadsResponse.json() as Array<{ id: number }>
      const res = await fetch(`${BASE}/api/contact-lists`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), productId, leadIds: leads.map(lead => lead.id) }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Could not create contact list")
      await qc.invalidateQueries({ queryKey: ["contact-lists", productId] })
      toast({ title: "Product contact list saved", description: `${result.memberCount} visible product leads are ready for a campaign.` })
      setName("")
      onClose()
    } catch (error) {
      toast({ title: "Could not save contact list", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create a product contact list</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This saves all leads you can currently see for this product as a reusable, named list.</p>
        <Input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Active product prospects" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save contact list
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function activityKindInfo(kind: string) {
  return ACTIVITY_KINDS.find(k => k.id === kind) ?? ACTIVITY_KINDS[0]
}

/** Format a GBP value compactly */
function fmtGBP(v: number) {
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `£${(v / 1_000).toFixed(0)}K`
  return `£${v.toFixed(0)}`
}

/** Format a deal's value in its native currency, compactly */
function fmtDeal(v: number, currency = "USD") {
  const sym = currency === "AED" ? "" : (currency === "GBP" ? "£" : "$")
  const suffix = currency === "AED" ? " AED" : ""
  if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M${suffix}`
  if (v >= 1_000) return `${sym}${(v / 1_000).toFixed(0)}K${suffix}`
  return `${sym}${v.toFixed(0)}${suffix}`
}

const qKey = (productId: number) => ["pipeline", productId]

const activitiesKey = (dealId: number) => ["deal-activities", dealId]
async function fetchDeals(productId: number): Promise<Deal[]> {
  const res = await fetch(`${BASE}/api/pipeline?productId=${productId}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function fetchActivities(dealId: number): Promise<Activity[]> {
  const res = await fetch(`${BASE}/api/pipeline/${dealId}/activities`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}
const emptyForm = () => ({
  contactName: "",
  companyName: "",
  value: "",
  currency: "USD",
  frequency: "monthly" as "monthly" | "annual",
  stage: "interested" as StageId,
  probability: 50,
  expectedCloseDate: "",
  nextReviewDate: "",
  notes: "",
})

// ── Deal form dialog ───────────────────────────────────────────────────────
function DealDialog({
  productId,
  deal,
  open,
  onClose,
}: {
  productId: number
  deal?: Deal
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(() =>
    deal
      ? {
          contactName: deal.contactName,
          companyName: deal.companyName ?? "",
          value: deal.value ? String(parseFloat(deal.value)) : "",
          currency: deal.currency ?? "USD",
          frequency: (deal.frequency ?? "monthly") as "monthly" | "annual",
          stage: deal.stage as StageId,
          probability: deal.probability,
          expectedCloseDate: deal.expectedCloseDate ?? "",
          nextReviewDate: deal.nextReviewDate ?? "",
          notes: deal.notes ?? "",
        }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.contactName.trim()) { setError("Contact name is required"); return }
    setSaving(true); setError(null)
    try {
      const body = {
        productId,
        contactName: form.contactName.trim(),
        companyName: form.companyName.trim() || null,
        value: parseFloat(form.value) || 0,
        currency: form.currency,
        frequency: form.frequency,
        stage: form.stage,
        probability: Number(form.probability),
        expectedCloseDate: form.expectedCloseDate || null,
        nextReviewDate: form.nextReviewDate || null,
        notes: form.notes.trim() || null,
      }
      const url = deal ? `${BASE}/api/pipeline/${deal.id}` : `${BASE}/api/pipeline`
      const method = deal ? "PATCH" : "POST"
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("Failed to save")
      await qc.invalidateQueries({ queryKey: qKey(productId) })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deal ? "Edit Deal" : "Add Deal"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Contact name *</label>
              <Input value={form.contactName} onChange={e => set("contactName", e.target.value)}
                placeholder="Jane Smith" className="h-11 rounded-xl" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Company</label>
              <Input value={form.companyName} onChange={e => set("companyName", e.target.value)}
                placeholder="Acme Corp" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Deal value</label>
              <div className="flex gap-2">
                <Select value={form.currency} onValueChange={v => set("currency", v)}>
                  <SelectTrigger className="h-11 rounded-xl w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={form.value} onChange={e => set("value", e.target.value)}
                  type="number" min="0" placeholder="5000" className="h-11 rounded-xl flex-1" />
              </div>
              {/* Frequency toggle */}
              <div className="flex gap-1.5 pt-0.5">
                {(["monthly", "annual"] as const).map(freq => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => set("frequency", freq)}
                    className={cn(
                      "flex-1 h-8 rounded-lg text-xs font-semibold border transition-colors",
                      form.frequency === freq
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {freq === "monthly" ? "Monthly" : "Annual"}
                  </button>
                ))}
              </div>
              {form.frequency === "monthly" && form.value && !isNaN(parseFloat(form.value)) && parseFloat(form.value) > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  = {fmtDeal(parseFloat(form.value) * 12, form.currency)}/yr in pipeline totals
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Stage</label>
              <Select value={form.stage} onValueChange={v => set("stage", v as StageId)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Probability ({form.probability}%)</label>
              <input type="range" min="0" max="100" step="5"
                value={form.probability}
                onChange={e => set("probability", Number(e.target.value))}
                className="w-full accent-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Expected close</label>
              <Input value={form.expectedCloseDate} onChange={e => set("expectedCloseDate", e.target.value)}
                type="date" className="h-11 rounded-xl" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <span>🔔</span> Next review date
              </label>
              <Input value={form.nextReviewDate} onChange={e => set("nextReviewDate", e.target.value)}
                type="date" className="h-11 rounded-xl" />
              <p className="text-[10px] text-muted-foreground">Appears in your Today task list on this date.</p>
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)}
                placeholder="Key context, next steps…" className="rounded-xl resize-none min-h-[80px]" />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} className="flex-1 h-11 rounded-xl">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 rounded-xl gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {deal ? "Save changes" : "Add deal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ActivityFeed({ dealId }: { dealId: number }) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<ActivityKind>("note")
  const [content, setContent] = useState("")
  const [followUpDays, setFollowUpDays] = useState("")
  const [saving, setSaving] = useState(false)

  const activitiesQuery = useQuery({
    queryKey: activitiesKey(dealId),
    queryFn: () => fetchActivities(dealId),
  })

  const activities = activitiesQuery.data ?? []

  const handleAdd = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { kind, content: content.trim() }
      if (followUpDays && !isNaN(Number(followUpDays)) && Number(followUpDays) > 0) {
        const d = new Date()
        d.setDate(d.getDate() + Math.round(Number(followUpDays)))
        body.nextReviewDate = d.toISOString().slice(0, 10)
      }
      const res = await fetch(`${BASE}/api/pipeline/${dealId}/activities`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("Failed")
      setContent("")
      setFollowUpDays("")
      await qc.invalidateQueries({ queryKey: activitiesKey(dealId) })
      // If nextReviewDate was set, also refresh the deal list
      if (body.nextReviewDate) {
        await qc.invalidateQueries({ queryKey: ["pipeline"] })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Kind selector */}
      <div className="flex gap-1.5 flex-wrap">
        {ACTIVITY_KINDS.map(k => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors",
              kind === k.id
                ? "bg-primary/10 border-primary/40 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <k.Icon className="w-3 h-3" />
            {k.label}
          </button>
        ))}
      </div>

      {/* Content input */}
      <Textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={`Add a ${kind}…`}
        className="rounded-xl resize-none text-sm min-h-[72px]"
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd()
        }}
      />

      {/* Follow-up option */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Follow up in</span>
        <Input
          value={followUpDays}
          onChange={e => setFollowUpDays(e.target.value)}
          type="number" min="1" placeholder="days"
          className="h-7 w-16 text-xs rounded-lg px-2"
        />
        <span className="text-xs text-muted-foreground">days (optional)</span>
        <Button
          onClick={handleAdd}
          disabled={saving || !content.trim()}
          size="sm"
          className="ml-auto h-7 px-3 rounded-lg text-xs gap-1"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add
        </Button>
      </div>

      {/* Feed */}
      {activitiesQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1].map(i => <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />)}
        </div>
      ) : activities.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No touchpoints yet — add your first one above.</p>
      ) : (
        <div className="space-y-2">
          {[...activities].reverse().map(act => {
            const info = activityKindInfo(act.kind)
            return (
              <div key={act.id} className="flex gap-2.5 items-start">
                <div className={cn("mt-0.5 shrink-0", info.color)}>
                  <info.Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{info.label}</span>
                    <span className="text-[10px] text-muted-foreground/60">·</span>
                    <span className="text-[10px] text-muted-foreground/60">{fmtRelative(act.createdAt)}</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{act.content}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
function DealCard({ deal, productId }: { deal: Deal; productId: number }) {
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const stage = stageInfo(deal.stage)
  const val = parseFloat(deal.value) || 0
  const annVal = annualValue(val, deal.frequency)
  const weighted = annVal * deal.probability / 100

  const handleDelete = async () => {
    setDeleting(true)
    await fetch(`${BASE}/api/pipeline/${deal.id}`, { method: "DELETE", credentials: "include" })
    qc.invalidateQueries({ queryKey: qKey(productId) })
  }

  const handleStageChange = async (newStage: string) => {
    await fetch(`${BASE}/api/pipeline/${deal.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    })
    qc.invalidateQueries({ queryKey: qKey(productId) })
  }

  return (
    <>
      <DealDialog productId={productId} deal={deal} open={editOpen} onClose={() => setEditOpen(false)} />
      <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
        <Card className="border-border bg-card overflow-hidden">
          <CardContent className="p-0">
            {/* Main row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/products/${productId}/opportunities/${deal.id}`} className="text-sm font-semibold truncate hover:underline">
                    {deal.contactName}
                  </Link>
                  {deal.companyName && (
                    <span className="text-xs text-muted-foreground truncate">· {deal.companyName}</span>
                  )}
                  {deal.health && deal.health !== "healthy" && (
                    <Badge variant="outline" className="text-[10px] capitalize">{deal.health.replace("_", " ")}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-sm font-bold text-primary">{fmtDeal(val, deal.currency)}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
                    {deal.frequency === "annual" ? "yr" : "mo"}
                  </span>
                  <span className="text-xs text-muted-foreground">{deal.probability}% → {fmtGBP(toGBP(weighted, deal.currency ?? "USD"))}</span>
                  {deal.expectedCloseDate && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {new Date(deal.expectedCloseDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditOpen(true)}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setExpanded(v => !v)}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted">
                  {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Stage badge strip */}
            <div className="px-4 pb-3 flex items-center gap-2">
              <Select value={deal.stage} onValueChange={handleStageChange}>
                <SelectTrigger className={cn("h-6 px-2.5 text-xs font-semibold rounded-full border w-auto gap-1.5 bg-transparent", stage.color)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expanded: notes + activity feed + delete */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-border"
                >
                  <div className="px-4 py-3 space-y-4">
                    {/* Static notes */}
                    {deal.notes && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{deal.notes}</p>
                    )}

                    {/* Activity feed */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Touchpoints
                      </p>
                      <ActivityFeed dealId={deal.id} />
                    </div>

                    {/* Delete */}
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex items-center gap-1.5 text-xs text-destructive/70 hover:text-destructive transition-colors pt-1"
                    >
                      {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete deal
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const [addOpen, setAddOpen] = useState(false)
  const [contactListOpen, setContactListOpen] = useState(false)
  const [stageFilter, setStageFilter] = useState<StageId | "all">("all")

  const { data: product } = useProductDetail(productId)
  const dealsQuery = useQuery({
    queryKey: qKey(productId),
    queryFn: () => fetchDeals(productId),
    enabled: !!productId,
  })

  const deals = dealsQuery.data ?? []

  // Summary numbers — all values annualised then converted to GBP
  const activeDeals = deals.filter(d => d.stage !== "lost")
  const totalPipelineGBP = activeDeals.reduce((s, d) => s + toGBP(annualValue(parseFloat(d.value) || 0, d.frequency), d.currency ?? "USD"), 0)
  const weightedPipelineGBP = activeDeals.reduce((s, d) => s + toGBP(annualValue(parseFloat(d.value) || 0, d.frequency) * d.probability / 100, d.currency ?? "USD"), 0)
  const closedWonGBP = deals.filter(d => d.stage === "won").reduce((s, d) => s + toGBP(annualValue(parseFloat(d.value) || 0, d.frequency), d.currency ?? "USD"), 0)

  // Group by stage for section display
  const displayed = stageFilter === "all" ? deals : deals.filter(d => d.stage === stageFilter)
  const grouped = STAGES.map(s => ({
    ...s,
    deals: displayed.filter(d => d.stage === s.id),
  })).filter(g => g.deals.length > 0)

  if (dealsQuery.isLoading) {
    return (
      <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 px-4 space-y-4 animate-pulse">
        <div className="h-10 w-32 bg-muted rounded" />
        <div className="h-40 bg-muted rounded-2xl" />
        <div className="h-32 bg-muted rounded-2xl" />
      </div>
    )
  }

  return (
    <>
      <DealDialog productId={productId} open={addOpen} onClose={() => setAddOpen(false)} />
      <ProductContactListDialog productId={productId} open={contactListOpen} onClose={() => setContactListOpen(false)} />

      <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 overflow-y-auto">
        <div className="px-4 shrink-0">
          {/* Breadcrumbs */}
          <Breadcrumbs
            items={[
              { label: "Portfolio", href: "/products" },
              { label: product?.name ?? "Product", href: `/products/${productId}` },
              { label: "Pipeline" },
            ]}
          />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Pipeline</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{deals.length} deal{deals.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/products/${productId}/my-actions`}>
                <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5">
                  <Target className="w-4 h-4" />
                  My Actions
                </Button>
              </Link>
              <Button onClick={() => setContactListOpen(true)} size="sm" variant="outline" className="h-9 rounded-xl gap-1.5">
                <Users className="w-4 h-4" />
                Contact list
              </Button>
              <Button onClick={() => setAddOpen(true)} size="sm" className="h-9 rounded-xl gap-1.5">
                <Plus className="w-4 h-4" />
                Add deal
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Pipeline</p>
                <p className="text-base font-bold text-primary leading-none">{fmtGBP(totalPipelineGBP)}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Weighted</p>
                <p className="text-base font-bold text-amber-400 leading-none">{fmtGBP(weightedPipelineGBP)}</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Won</p>
                <p className="text-base font-bold text-green-400 leading-none">{fmtGBP(closedWonGBP)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Stage filter pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-3 no-scrollbar">
            <button
              onClick={() => setStageFilter("all")}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                stageFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              All ({deals.length})
            </button>
            {STAGES.map(s => {
              const count = deals.filter(d => d.stage === s.id).length
              if (count === 0) return null
              return (
                <button
                  key={s.id}
                  onClick={() => setStageFilter(s.id as StageId)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                    stageFilter === s.id ? s.color : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s.label} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* Deal list */}
        <div className="px-4 space-y-6">
          {grouped.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Target className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-semibold text-muted-foreground">No deals yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add your first deal to start tracking your pipeline.</p>
              <Button onClick={() => setAddOpen(true)} variant="outline" className="mt-4 rounded-xl gap-2">
                <Plus className="w-4 h-4" />
                Add deal
              </Button>
            </div>
          )}

          <AnimatePresence>
            {grouped.map(group => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-xs font-semibold border", group.color)}>{group.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {fmtGBP(group.deals.reduce((s, d) => s + toGBP(parseFloat(d.value) || 0, d.currency ?? "USD"), 0))}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.deals.map(deal => (
                    <DealCard key={deal.id} deal={deal} productId={productId} />
                  ))}
                </div>
              </div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}

type ActivityKind = (typeof ACTIVITY_KINDS)[number]["id"]

function fmtRelative(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
