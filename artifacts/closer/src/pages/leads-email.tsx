/**
 * Email compose + templates management UI for the Leads page.
 * Exported: EmailComposeDialog, TemplatesManagerDialog, LinkedInComposeDialog, LinkedInTemplatesManagerDialog,
 *           BulkScheduleDialog, JournalView
 */
import { useState, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RichTextEditor } from "@/components/RichTextEditor"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  Mail, Paperclip, X, Clock, ChevronDown, Plus, Trash2,
  FileText, Send, Calendar, CheckCircle2, AlertCircle,
  Edit2, Package, Linkedin, Copy, Check, ExternalLink, MessageSquare,
  Users, CalendarClock, Sparkles, Loader2, ChevronUp, Ban, ChevronRight,
  Zap, AlertTriangle, UserMinus, Eye, MousePointerClick
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

// ── Types ──────────────────────────────────────────────────────────────────
interface Lead {
  id: number
  firstName: string
  lastName: string
  email: string | null
  company: string | null
  title: string | null
  productId?: number | null
}

export interface EmailTemplate {
  id: number
  name: string
  productId: number | null
  subject: string
  body: string
  isFollowUp: boolean
  followUpDelayDays: number | null
  createdAt: string
}

interface EmailSend {
  id: number
  leadId: number
  templateId: number | null
  toAddress: string
  subject: string
  body: string
  status: "pending" | "sent" | "failed" | "scheduled"
  resendId: string | null
  scheduledFor: string | null
  sentAt: string | null
  errorMessage: string | null
  createdAt: string
}

interface Product {
  id: number
  name: string
  emailSignature?: string | null
}

interface Attachment {
  filename: string
  content: string // base64
  type: string
  size: number
}

// ── Variable hints ──────────────────────────────────────────────────────────
const VARS = ["{{firstName}}", "{{lastName}}", "{{company}}", "{{title}}", "{{email}}"]

// ── Schedule presets ────────────────────────────────────────────────────────
function toLocalDatetimeValue(d: Date): string {
  // Returns "YYYY-MM-DDTHH:mm" in local time for datetime-local inputs
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const SCHEDULE_PRESETS: { label: string; getValue: () => string }[] = [
  {
    label: "In 1 hour",
    getValue: () => {
      const d = new Date(Date.now() + 60 * 60 * 1000)
      d.setSeconds(0, 0)
      return toLocalDatetimeValue(d)
    },
  },
  {
    label: "Tomorrow 9 AM",
    getValue: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      return toLocalDatetimeValue(d)
    },
  },
  {
    label: "Next Monday 9 AM",
    getValue: () => {
      const d = new Date()
      const daysUntilMonday = ((8 - d.getDay()) % 7) || 7
      d.setDate(d.getDate() + daysUntilMonday)
      d.setHours(9, 0, 0, 0)
      return toLocalDatetimeValue(d)
    },
  },
]

function formatPresetTime(datetimeLocal: string): string {
  if (!datetimeLocal) return ""
  try {
    const d = new Date(datetimeLocal)
    return format(d, "EEE, MMM d 'at' h:mm a")
  } catch {
    return ""
  }
}

function interpolatePreview(text: string, lead: Lead): string {
  // Case-insensitive so {{firstname}} and {{firstName}} both work in previews
  return text
    .replace(/\{\{firstName\}\}/gi, lead.firstName || "")
    .replace(/\{\{lastName\}\}/gi, lead.lastName || "")
    .replace(/\{\{company\}\}/gi, lead.company || "")
    .replace(/\{\{title\}\}/gi, lead.title || "")
    .replace(/\{\{email\}\}/gi, lead.email || "")
}

// ── API helpers ────────────────────────────────────────────────────────────
async function fetchTemplates(): Promise<EmailTemplate[]> {
  const res = await fetch(`${BASE}/api/email-templates`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch templates")
  return res.json()
}

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${BASE}/api/products`, { credentials: "include" })
  if (!res.ok) return []
  return res.json()
}

async function fetchProductById(id: number): Promise<Product | null> {
  const res = await fetch(`${BASE}/api/products/${id}`, { credentials: "include" })
  if (!res.ok) return null
  return res.json()
}
async function fetchEmailHistory(leadId: number): Promise<EmailSend[]> {
  const res = await fetch(`${BASE}/api/leads/${leadId}/email-history`, { credentials: "include" })
  if (!res.ok) return []
  return res.json()
}

interface JournalSend {
  id: number
  leadId: number
  toAddress: string
  subject: string
  status: string
  scheduledFor: string | null
  sentAt: string | null
  errorMessage: string | null
  createdAt: string
  firstName: string | null
  lastName: string | null
  company: string | null
  templateName: string | null
  campaignName?: string | null
}

interface JournalData {
  summary: { total: number; sent: number; scheduled: number; failed: number; pending: number }
  byTemplate: Array<{
    templateId: number | null
    templateName: string | null
    total: number
    sent: number
    scheduled: number
    failed: number
  }>
  recent: JournalSend[]
}

async function fetchJournal(): Promise<JournalData> {
  const res = await fetch(`${BASE}/api/email-journal`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch journal")
  return res.json()
}

interface Campaign {
  batchId: string | null
  templateId: number | null
  templateName: string | null
  campaignName?: string | null
  subject: string
  total: number
  scheduled: number
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
  firstSendAt: string | null
  lastSendAt: string | null
  createdAt: string | null
}

interface CampaignSend {
  id: number
  leadId: number
  toAddress: string
  subject: string
  status: string
  scheduledFor: string | null
  sentAt: string | null
  errorMessage: string | null
  deliveredAt: string | null
  openedAt: string | null
  lastOpenedAt: string | null
  openCount: number
  clickedAt: string | null
  lastClickedAt: string | null
  clickCount: number
  lastClickedUrl: string | null
  bouncedAt: string | null
  bounceType: string | null
  bounceMessage: string | null
  createdAt: string
  firstName: string | null
  lastName: string | null
  company: string | null
}

async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${BASE}/api/email-campaigns`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch campaigns")
  return res.json()
}

async function fetchCampaignSends(batchId: string): Promise<CampaignSend[]> {
  const res = await fetch(`${BASE}/api/email-campaigns/${batchId}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch campaign sends")
  return res.json()
}

async function cancelCampaign(batchId: string): Promise<{ cancelled: number }> {
  const res = await fetch(`${BASE}/api/email-campaigns/${batchId}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) throw new Error("Failed to cancel campaign")
  return res.json()
}

async function bulkScheduleEmail(params: {
  leadIds: number[]
  templateId: number | null
  subject: string
  body: string
  scheduledFor: string
}): Promise<{ scheduled: number; skipped: number; duplicates: number; batchId: string }> {
  const res = await fetch(`${BASE}/api/leads/bulk-schedule-email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Failed to schedule emails")
  }
  return res.json()
}

interface RecentLead {
  leadId: number
  lastSentAt: string
}

async function checkEmailRecency(leadIds: number[], withinDays = 3): Promise<{ recentLeadIds: number[]; recentLeads: RecentLead[]; withinDays: number }> {
  const res = await fetch(`${BASE}/api/leads/bulk-email-recency-check`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds, withinDays }),
  })
  if (!res.ok) return { recentLeadIds: [], recentLeads: [], withinDays }
  return res.json()
}
export function BulkScheduleDialog({
  leads,
  open,
  onClose,
  onScheduled,
}: {
  leads: Lead[]
  open: boolean
  onClose: () => void
  onScheduled?: (count: number) => void
}) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [scheduledFor, setScheduledFor] = useState("")
  const [schedulePreset, setSchedulePreset] = useState<string | null>(null)
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set())

  const { data: templates = [] } = useQuery({
    queryKey: ["email-templates"],
    queryFn: fetchTemplates,
    enabled: open,
  })

  // When a template is selected, fetch lead IDs that already received it (duplicate guard)
  const { data: alreadySentIds = [] } = useQuery<number[]>({
    queryKey: ["template-sent-leads", templateId],
    queryFn: async () => {
      if (!templateId) return []
      const res = await fetch(`${BASE}/api/email-templates/${templateId}/sent-lead-ids`, {
        credentials: "include",
      })
      if (!res.ok) return []
      return res.json()
    },
    enabled: open && templateId !== null,
  })

  // Derive a shared product from the leads so the signature preview matches what each recipient will receive.
  // The server appends signatures from each lead's own product, so a preview is only accurate when every
  // lead in this blast shares the same product. If they differ (or none have a product), hide the preview.
  const uniqueLeadProductIds = [...new Set(leads.map(l => l.productId ?? null))]
  const sharedLeadProductId =
    uniqueLeadProductIds.length === 1 && uniqueLeadProductIds[0] !== null
      ? uniqueLeadProductIds[0]
      : null
  const { data: sharedLeadProduct } = useQuery({
    queryKey: ["product", sharedLeadProductId],
    queryFn: () => fetchProductById(sharedLeadProductId!),
    enabled: open && sharedLeadProductId !== null,
  })
  const bulkSignature = sharedLeadProduct?.emailSignature ?? null

  // Recency pre-flight: check which leads were emailed in the last N days
  const allLeadIds = leads.map(l => l.id)
  const { data: recencyData, isLoading: recencyLoading } = useQuery({
    queryKey: ["bulk-email-recency", allLeadIds],
    queryFn: () => checkEmailRecency(allLeadIds, RECENCY_DAYS),
    enabled: open && allLeadIds.length > 0,
    staleTime: 30_000,
  })
  const recentLeadIds: number[] = recencyData?.recentLeadIds ?? []
  const recentLeads: RecentLead[] = recencyData?.recentLeads ?? []
  const activeRecentIds = recentLeadIds.filter(id => !excludedIds.has(id))
  const activeRecentLeads = recentLeads.filter(rl => !excludedIds.has(rl.leadId))

  const alreadySentSet = new Set(alreadySentIds)
  const allLeadsWithEmail = leads.filter(l => l.email)
  const leadsWithEmail = allLeadsWithEmail.filter(l =>
    !alreadySentSet.has(l.id) && !excludedIds.has(l.id)
  )
  const alreadySentCount = allLeadsWithEmail.filter(l => alreadySentSet.has(l.id) && !excludedIds.has(l.id)).length
  const noEmailCount = leads.filter(l => !l.email).length
  const recentlyExcludedCount = excludedIds.size

  useEffect(() => {
    if (!open) {
      setTemplateId(null); setSubject(""); setBody("")
      setScheduledFor(""); setSchedulePreset(null); setExcludedIds(new Set())
    }
  }, [open])

  useEffect(() => {
    const t = templates.find(t => t.id === templateId)
    if (t) { setSubject(t.subject); setBody(t.body) }
  }, [templateId, templates])

  const scheduleMut = useMutation({
    mutationFn: () => bulkScheduleEmail({
      leadIds: leadsWithEmail.map(l => l.id),
      templateId,
      subject,
      body,
      scheduledFor: new Date(scheduledFor).toISOString(),
    }),
    onSuccess: (data) => {
      const noEmailSkipped = data.skipped - data.duplicates;
      const skipParts: string[] = [];
      if (data.duplicates > 0) skipParts.push(`${data.duplicates} already scheduled`);
      if (noEmailSkipped > 0) skipParts.push(`${noEmailSkipped} no email address`);
      toast({
        title: `${data.scheduled} email${data.scheduled !== 1 ? "s" : ""} scheduled`,
        description: skipParts.length > 0 ? `${data.skipped} skipped — ${skipParts.join(", ")}` : undefined,
      })
      qc.invalidateQueries({ queryKey: ["email-journal"] })
      onScheduled?.(data.scheduled)
      onClose()
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  })

  const canSubmit = subject.trim() && body.trim() && scheduledFor && leadsWithEmail.length > 0
  const minDatetime = toLocalDatetimeValue(new Date(Date.now() + 60_000))

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <CalendarClock className="w-4 h-4 text-primary" />
            Schedule Email Blast
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lead summary */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground font-medium">
                  {leads.length} lead{leads.length !== 1 ? "s" : ""} selected
                </span>
              </div>
              <span className="text-sm font-medium text-primary">
                {leadsWithEmail.length} will be sent
              </span>
            </div>
            {alreadySentCount > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-400 font-medium">{alreadySentCount} excluded</span>
                {" "}— already received this template
              </p>
            )}
            {recentlyExcludedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-400 font-medium">{recentlyExcludedCount} excluded</span>
                {" "}— emailed recently
              </p>
            )}
            {noEmailCount > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-400 font-medium">{noEmailCount} excluded</span>
                {" "}— no email address
              </p>
            )}
          </div>

          {/* Recency warning */}
          {recencyLoading && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-400/5 border border-amber-400/20">
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
              <span className="text-xs text-amber-400">Checking for recent sends…</span>
            </div>
          )}
          {!recencyLoading && activeRecentIds.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs text-red-400">
                  <span className="font-semibold">{activeRecentIds.length} of {leads.length - recentlyExcludedCount} lead{leads.length - recentlyExcludedCount !== 1 ? "s" : ""}</span> received an email in the last {RECENCY_DAYS} days.
                </p>
                <ul className="space-y-1">
                  {activeRecentLeads.map(rl => {
                    const lead = leads.find(l => l.id === rl.leadId)
                    if (!lead) return null
                    return (
                      <li key={rl.leadId} className="flex items-center gap-2">
                        <span className="flex-1 text-[11px] text-red-300/70 truncate">
                          {lead.firstName} {lead.lastName}{lead.company ? `, ${lead.company}` : ""} — emailed {formatDistanceToNow(new Date(rl.lastSentAt), { addSuffix: true })}
                        </span>
                        <button
                          onClick={() => setExcludedIds(prev => { const next = new Set(prev); next.add(rl.leadId); return next })}
                          className="shrink-0 text-red-400/50 hover:text-red-300 transition-colors"
                          title="Remove from selection"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <button
                  onClick={() => setExcludedIds(prev => {
                    const next = new Set(prev)
                    activeRecentIds.forEach(id => next.add(id))
                    return next
                  })}
                  className="flex items-center gap-1 text-[11px] font-medium text-red-400 underline underline-offset-2 hover:text-red-300 transition-colors"
                >
                  <UserMinus className="w-3 h-3" />
                  Deselect {activeRecentIds.length} recently emailed lead{activeRecentIds.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* Template picker */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Template (optional)</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setTemplateId(null)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-all",
                  templateId === null
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground border-border/30 hover:border-border"
                )}
              >Custom</button>
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-all",
                    templateId === t.id
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground border-border/30 hover:border-border"
                  )}
                >{t.name}</button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</p>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject line…"
              className="bg-muted/40 border-border/30"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Body</p>
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Email body…"
              variables={VARS}
              minHeight={160}
            />
          </div>

          {/* Signature preview */}
          {bulkSignature && (
            <div className="rounded-xl bg-muted/20 border border-border/20 p-3 space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1">
                <Mail className="w-3 h-3" />
                Signature (appended automatically)
              </p>
              <div className="border-t border-border/20 pt-2">
                <p className="text-[10px] text-muted-foreground/50 font-mono mb-1">--</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{bulkSignature}</p>
              </div>
            </div>
          )}

          {/* Scheduled date/time — presets + custom picker */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Send at</p>
            <div className="flex gap-2 flex-wrap">
              {SCHEDULE_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => {
                    const dt = preset.getValue()
                    setSchedulePreset(preset.label)
                    setScheduledFor(dt)
                  }}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-all",
                    schedulePreset === preset.label
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground border-border/30 hover:border-border"
                  )}
                >{preset.label}</button>
              ))}
              <button
                onClick={() => {
                  setSchedulePreset("custom")
                  setScheduledFor("")
                }}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-all",
                  schedulePreset === "custom"
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground border-border/30 hover:border-border"
                )}
              >Custom</button>
            </div>
            {schedulePreset === "custom" && (
              <input
                type="datetime-local"
                value={scheduledFor}
                min={minDatetime}
                onChange={e => setScheduledFor(e.target.value)}
                className="w-full bg-muted/40 border border-border/30 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            )}
            {scheduledFor && schedulePreset !== "custom" && (
              <p className="text-xs text-muted-foreground">{formatPresetTime(scheduledFor)}</p>
            )}
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => scheduleMut.mutate()}
            disabled={!canSubmit || scheduleMut.isPending}
          >
            <Calendar className="w-4 h-4" />
            {scheduleMut.isPending
              ? "Scheduling…"
              : `Schedule ${leadsWithEmail.length} email${leadsWithEmail.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── CampaignRow — expandable campaign card ──────────────────────────────────
function CampaignRow({ campaign, onCancelled }: { campaign: Campaign; onCancelled: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data: sends = [], isLoading: sendsLoading } = useQuery({
    queryKey: ["campaign-sends", campaign.batchId],
    queryFn: () => fetchCampaignSends(campaign.batchId!),
    enabled: expanded && !!campaign.batchId,
    refetchInterval: expanded ? 30_000 : false,
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelCampaign(campaign.batchId!),
    onSuccess: (data) => {
      toast({ title: `${data.cancelled} email${data.cancelled !== 1 ? "s" : ""} cancelled` })
      qc.invalidateQueries({ queryKey: ["email-campaigns"] })
      qc.invalidateQueries({ queryKey: ["email-journal"] })
      qc.invalidateQueries({ queryKey: ["campaign-sends", campaign.batchId] })
      onCancelled()
    },
    onError: () => toast({ title: "Failed to cancel campaign", variant: "destructive" }),
  })

  const isCancellable = campaign.scheduled > 0
  const isDone = campaign.scheduled === 0 && campaign.cancelled === 0

  // Time spread label
  const spreadLabel = (() => {
    if (!campaign.firstSendAt || !campaign.lastSendAt) return null
    const first = new Date(campaign.firstSendAt)
    const last = new Date(campaign.lastSendAt)
    if (first.getTime() === last.getTime()) return format(first, "MMM d, HH:mm")
    return `${format(first, "MMM d, HH:mm")} – ${format(last, "HH:mm")}`
  })()

  const SS: Record<string, { color: string; label: string }> = {
    sent:      { color: "text-emerald-400 bg-emerald-400/10", label: "Sent" },
    scheduled: { color: "text-amber-400 bg-amber-400/10",     label: "Scheduled" },
    failed:    { color: "text-red-400 bg-red-400/10",         label: "Failed" },
    pending:   { color: "text-sky-400 bg-sky-400/10",         label: "Sending" },
    cancelled: { color: "text-muted-foreground bg-muted/40",   label: "Cancelled" },
  }

  return (
    <div className="rounded-xl border border-border/20 bg-muted/40 overflow-hidden">
      {/* Header row — use a div so we can nest real controls inside */}
      <div className="flex items-start gap-3 p-3">
        {/* Clickable expand area */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-1 min-w-0 text-left space-y-1"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="text-sm font-medium text-foreground truncate">{campaign.campaignName || campaign.subject}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {campaign.total} email{campaign.total !== 1 ? "s" : ""}
            </span>
            {spreadLabel && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {spreadLabel}
              </span>
            )}
            {campaign.templateName && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {campaign.templateName}
              </span>
            )}
            {campaign.campaignName && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Sequence campaign
              </span>
            )}
          </div>

          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {campaign.sent > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-emerald-400 bg-emerald-400/10">
                {campaign.sent} sent
              </span>
            )}
            {campaign.scheduled > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-amber-400 bg-amber-400/10">
                {campaign.scheduled} pending
              </span>
            )}
            {campaign.failed > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-red-400 bg-red-400/10">
                {campaign.failed} failed
              </span>
            )}
            {campaign.cancelled > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-muted-foreground bg-muted/40">
                {campaign.cancelled} cancelled
              </span>
            )}
            {campaign.delivered > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-sky-400 bg-sky-400/10">
                {campaign.delivered} delivered
              </span>
            )}
            {campaign.opened > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-sky-400 bg-sky-400/10 flex items-center gap-1">
                <Eye className="w-2.5 h-2.5" /> {campaign.openRate}% opened
              </span>
            )}
            {campaign.clicked > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-emerald-400 bg-emerald-400/10 flex items-center gap-1">
                <MousePointerClick className="w-2.5 h-2.5" /> {campaign.clickThroughRate}% clicked
              </span>
            )}
            {campaign.bounced > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-red-400 bg-red-400/10 flex items-center gap-1">
                <Ban className="w-2.5 h-2.5" /> {campaign.bounced} bounced
              </span>
            )}
          </div>
        </button>

        {/* Action controls — outside the expand button */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {isCancellable && (
            <button
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-red-400 border border-red-400/20 bg-red-400/5 hover:bg-red-400/15 transition-colors disabled:opacity-50"
            >
              <Ban className="w-3 h-3" />
              {cancelMut.isPending ? "Cancelling…" : "Cancel"}
            </button>
          )}
          <button onClick={() => setExpanded(v => !v)}>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground/50 transition-transform", expanded && "rotate-90")} />
          </button>
        </div>
      </div>

      {/* Expanded sends list */}
      {expanded && (
        <div className="border-t border-border/15">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-b border-border/10 bg-muted/10">
            {[
              { label: "Delivered", value: campaign.delivered, Icon: CheckCircle2, color: "text-sky-400", suffix: campaign.sent > 0 ? `of ${campaign.sent} sent` : undefined },
              { label: "Opened", value: campaign.opened, Icon: Eye, color: "text-sky-400", suffix: `${campaign.openRate}% of delivered` },
              { label: "Clicked", value: campaign.clicked, Icon: MousePointerClick, color: "text-emerald-400", suffix: `${campaign.clickThroughRate}% of delivered` },
              { label: "Bounced", value: campaign.bounced, Icon: AlertTriangle, color: "text-red-400", suffix: campaign.opened > 0 ? `${campaign.clickToOpenRate}% click-to-open` : undefined },
            ].map(({ label, value, Icon, color, suffix }) => (
              <div key={label} className="rounded-lg border border-border/10 bg-card/30 px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn("w-3 h-3", color)} />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
                <p className={cn("mt-1 text-base font-semibold tabular-nums", color)}>{value}</p>
                {suffix && <p className="mt-0.5 text-[9px] text-muted-foreground truncate">{suffix}</p>}
              </div>
            ))}
          </div>
          {sendsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {sends.map(send => {
                const name = [send.firstName, send.lastName].filter(Boolean).join(" ") || (send.leadId == null ? "Deleted contact" : send.toAddress)
                const ss = SS[send.status] ?? { color: "text-muted-foreground bg-muted/40", label: send.status }
                return (
                  <div key={send.id} className={cn("flex items-center gap-3 px-3 py-2.5", send.bouncedAt && "bg-red-500/5")}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{send.toAddress}</p>
                      {send.lastClickedUrl && (
                        <a
                          href={send.lastClickedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline truncate"
                          title={`Last tracked click: ${send.lastClickedUrl}`}
                        >
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{send.lastClickedUrl}</span>
                        </a>
                      )}
                      {send.bouncedAt && (
                        <p className="mt-1 text-[10px] text-red-400 truncate" title={send.bounceMessage ?? undefined}>
                          {send.bounceType ?? "Bounced"}{send.bounceMessage ? ` — ${send.bounceMessage}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", ss.color)}>
                        {ss.label}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {send.openCount > 0 && (
                          <span className="flex items-center gap-0.5 text-sky-400" title={`Last opened ${send.lastOpenedAt ? format(new Date(send.lastOpenedAt), "PPp") : ""}`}>
                            <Eye className="w-3 h-3" />{send.openCount}
                          </span>
                        )}
                        {send.clickCount > 0 && (
                          <span className="flex items-center gap-0.5 text-emerald-400" title={`Last clicked ${send.lastClickedAt ? format(new Date(send.lastClickedAt), "PPp") : ""}`}>
                            <MousePointerClick className="w-3 h-3" />{send.clickCount}
                          </span>
                        )}
                      </div>
                      {(send.sentAt ?? send.scheduledFor) && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {format(new Date(send.sentAt ?? send.scheduledFor!), "HH:mm:ss")}
                        </span>
                      )}
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

// ── JournalView ─────────────────────────────────────────────────────────────
export function JournalView() {
  const [tab, setTab] = useState<"campaigns" | "all">("campaigns")
  const [statusFilter, setStatusFilter] = useState("all")

  const { data, isLoading: journalLoading } = useQuery({
    queryKey: ["email-journal"],
    queryFn: fetchJournal,
    refetchInterval: 30_000,
  })

  const { data: campaigns = [], isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: fetchCampaigns,
    refetchInterval: 30_000,
  })

  const isLoading = journalLoading || campaignsLoading
  const summary = data?.summary ?? { total: 0, sent: 0, scheduled: 0, failed: 0, pending: 0 }
  const recent = (data?.recent ?? []).filter(s =>
    statusFilter === "all" ? true : s.status === statusFilter
  )

  const STAT_CARDS = [
    { label: "Sent",      value: summary.sent,      color: "text-emerald-400", bg: "bg-emerald-400/5", border: "border-emerald-400/20", Icon: CheckCircle2 },
    { label: "Scheduled", value: summary.scheduled,  color: "text-amber-400",   bg: "bg-amber-400/5",   border: "border-amber-400/20",   Icon: Clock },
    { label: "Failed",    value: summary.failed,     color: "text-red-400",     bg: "bg-red-400/5",     border: "border-red-400/20",     Icon: AlertCircle },
    { label: "Total",     value: summary.total,      color: "text-sky-400",     bg: "bg-sky-400/5",     border: "border-sky-400/20",     Icon: Mail },
  ]

  const STATUS_FILTERS = [
    { key: "all",       label: "All" },
    { key: "sent",      label: "Sent" },
    { key: "scheduled", label: "Scheduled" },
    { key: "failed",    label: "Failed" },
    { key: "pending",   label: "Sending" },
  ]

  if (isLoading) return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 gap-2">
        {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/40" />)}
      </div>
      {[0,1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-muted/40" />)}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        {STAT_CARDS.map(({ label, value, color, bg, border, Icon }) => (
          <div key={label} className={cn("p-3.5 rounded-xl border", bg, border)}>
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className={cn("w-3.5 h-3.5", color)} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/40 border border-border/15">
        {[
          { key: "campaigns" as const, label: "Campaigns", icon: Zap },
          { key: "all" as const, label: "All Sends", icon: Mail },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg font-medium transition-all",
              tab === key
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {key === "campaigns" && campaigns.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold ml-0.5">
                {campaigns.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Campaigns tab */}
      {tab === "campaigns" && (
        <div className="space-y-2">
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <CalendarClock className="w-8 h-8 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">No bulk campaigns yet</p>
              <p className="text-xs text-muted-foreground/60">Use "Schedule Email Blast" to send to multiple leads at once</p>
            </div>
          ) : (
            campaigns.map(c => (
              <CampaignRow
                key={c.batchId}
                campaign={c}
                onCancelled={() => refetchCampaigns()}
              />
            ))
          )}
        </div>
      )}

      {/* All sends tab */}
      {tab === "all" && (
        <div className="space-y-2">
          {/* Status filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 transition-all",
                  statusFilter === f.key
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground border-border/30 hover:border-border"
                )}
              >{f.label}</button>
            ))}
          </div>

          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Mail className="w-8 h-8 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                {statusFilter === "all" ? "No emails sent yet" : `No emails with status "${statusFilter}"`}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recent.map(send => {
                const name = [send.firstName, send.lastName].filter(Boolean).join(" ") || (send.leadId == null ? "Deleted contact" : send.toAddress)
                const dateStr = send.sentAt ?? send.scheduledFor ?? send.createdAt
                const SS: Record<string, { color: string; label: string }> = {
                  sent:      { color: "text-emerald-400 bg-emerald-400/10", label: "Sent" },
                  scheduled: { color: "text-amber-400 bg-amber-400/10",     label: "Scheduled" },
                  failed:    { color: "text-red-400 bg-red-400/10",         label: "Failed" },
                  pending:   { color: "text-sky-400 bg-sky-400/10",         label: "Sending" },
                  cancelled: { color: "text-muted-foreground bg-muted/40",   label: "Cancelled" },
                }
                const ss = SS[send.status] ?? { color: "text-muted-foreground bg-muted/40", label: send.status }
                return (
                  <div key={send.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border/10">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground truncate">{name}</p>
                        {send.company && <span className="text-xs text-muted-foreground truncate">· {send.company}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{send.subject}</p>
                      {send.templateName && <p className="text-[10px] text-muted-foreground/50">{send.templateName}</p>}
                      {send.errorMessage && <p className="text-[10px] text-red-400">{send.errorMessage}</p>}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", ss.color)}>
                        {ss.label}
                      </span>
                      {dateStr && (
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(dateStr), "MMM d, HH:mm")}
                        </span>
                      )}
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

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: EmailSend["status"] }) {
  const map = {
    sent:      { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10", label: "Sent" },
    scheduled: { icon: Clock,        color: "text-amber-400",   bg: "bg-amber-400/10",   label: "Scheduled" },
    pending:   { icon: Clock,        color: "text-sky-400",     bg: "bg-sky-400/10",     label: "Sending…" },
    failed:    { icon: AlertCircle,  color: "text-red-400",     bg: "bg-red-400/10",     label: "Failed" },
  }
  const cfg = map[status] ?? map.pending
  const Icon = cfg.icon
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium", cfg.color, cfg.bg)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  )
}

// ── Email History ──────────────────────────────────────────────────────────
export function EmailHistory({ leadId }: { leadId: number }) {
  const { data: history = [] } = useQuery({
    queryKey: ["email-history", leadId],
    queryFn: () => fetchEmailHistory(leadId),
    refetchInterval: 30_000,
  })

  if (!history.length) return (
    <div className="text-xs text-muted-foreground text-center py-3">No emails sent yet</div>
  )

  return (
    <div className="space-y-2">
      {history.map(send => (
        <div key={send.id} className="p-2.5 rounded-xl bg-muted/40 border border-border/20 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-foreground truncate flex-1">{send.subject}</p>
            <StatusBadge status={send.status} />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {send.sentAt && <span>{formatDistanceToNow(new Date(send.sentAt), { addSuffix: true })}</span>}
            {send.scheduledFor && send.status === "scheduled" && (
              <span>Scheduled for {format(new Date(send.scheduledFor), "d MMM, HH:mm")}</span>
            )}
            {send.errorMessage && <span className="text-red-400">{send.errorMessage}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Email Compose Dialog ───────────────────────────────────────────────────
export function EmailComposeDialog({
  lead,
  open,
  onClose,
  onSent,
  initialBody,
  initialSubject,
}: {
  lead: Lead | null
  open: boolean
  onClose: () => void
  /** Called immediately after a successful send, before the dialog closes */
  onSent?: () => void
  /** Pre-fill the body when the dialog opens (e.g. from AI Assistant) */
  initialBody?: string
  /** Pre-fill the subject when the dialog opens (e.g. from AI Assistant) */
  initialSubject?: string
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduledFor, setScheduledFor] = useState("")
  const [schedulePreset, setSchedulePreset] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const { data: templates = [] } = useQuery({ queryKey: ["email-templates"], queryFn: fetchTemplates })

  // Pre-fill body (and optionally subject) from AI suggestion when dialog opens
  useEffect(() => {
    if (open && initialBody) {
      setBody(initialBody)
      setSelectedTemplateId(null)
    }
    if (open && initialSubject) {
      setSubject(initialSubject)
    }
  }, [open, initialBody, initialSubject])

  // Fetch the lead's product to show its email signature
  const { data: leadProduct } = useQuery({
    queryKey: ["product", lead?.productId],
    queryFn: () => fetchProductById(lead!.productId!),
    enabled: !!lead?.productId,
  })
  const emailSignature = leadProduct?.emailSignature ?? null

  // Apply template
  const applyTemplate = (t: EmailTemplate) => {
    setSelectedTemplateId(t.id)
    setSubject(t.subject)
    setBody(t.body)
    setShowTemplates(false)
  }

  // File attachment
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const newAttachments: Attachment[] = []
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      newAttachments.push({ filename: file.name, content: base64, type: file.type, size: file.size })
    }
    setAttachments(p => [...p, ...newAttachments])
    if (fileRef.current) fileRef.current.value = ""
  }

  const removeAttachment = (i: number) => setAttachments(p => p.filter((_, idx) => idx !== i))

  const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`

  // Send mutation
  const sendMut = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("No lead")
      const res = await fetch(`${BASE}/api/leads/${lead.id}/send-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId ?? undefined,
          subject,
          body,
          attachments: attachments.map(a => ({ filename: a.filename, content: a.content, type: a.type })),
          ...(scheduleMode && scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Send failed")
      }
      return res.json()
    },
    onSuccess: (data: EmailSend) => {
      qc.invalidateQueries({ queryKey: ["email-history", lead?.id] })
      qc.invalidateQueries({ queryKey: ["leads"] })
      toast({
        title: data.status === "scheduled" ? "Follow-up scheduled" : "Email sent",
        description: data.status === "scheduled"
          ? `Will send on ${format(new Date(data.scheduledFor!), "d MMM 'at' HH:mm")}`
          : undefined,
      })
      onSent?.()
      onClose()
      setSubject(""); setBody(""); setAttachments([]); setSelectedTemplateId(null); setScheduledFor(""); setScheduleMode(false); setSchedulePreset(null)
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  })

  if (!lead) return null

  const previewSubject = interpolatePreview(subject, lead)
  const previewBody = interpolatePreview(body, lead)
  const canSend = !!subject && !!body && !!lead.email && (!scheduleMode || !!scheduledFor)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            Email {lead.firstName} {lead.lastName}
          </DialogTitle>
        </DialogHeader>

        {/* No email warning */}
        {!lead.email && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            This lead has no email address. Add one first.
          </div>
        )}

        <div className="space-y-3">
          {/* Template picker */}
          <div>
            <button
              onClick={() => setShowTemplates(v => !v)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              {selectedTemplateId
                ? templates.find(t => t.id === selectedTemplateId)?.name ?? "Template selected"
                : "Use a template"}
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showTemplates && "rotate-180")} />
            </button>

            {showTemplates && (
              <div className="mt-2 rounded-xl border border-border/30 bg-card divide-y divide-border/20 max-h-48 overflow-y-auto">
                {templates.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3 text-center">No templates yet — create one in Templates</p>
                )}
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <p className="text-sm text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* To */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">To</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border/30 text-sm text-foreground">
              {lead.email ?? <span className="text-muted-foreground italic">no email</span>}
            </div>
          </div>

          {/* Subject */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Subject</p>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Enter subject…"
              className="bg-muted/40 border-border/30"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Message</p>
              <button
                onClick={() => setPreviewing(v => !v)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {previewing ? "Edit" : "Preview"}
              </button>
            </div>
            {previewing ? (
              <div
                className="rounded-xl bg-muted/40 border border-border/30 p-3 text-sm text-foreground min-h-[120px] prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewBody || "<span class='text-muted-foreground italic'>Nothing to preview</span>" }}
              />
            ) : (
              <RichTextEditor
                value={body}
                onChange={setBody}
                placeholder={`Hi {{firstName}},\n\nI wanted to reach out about…`}
                variables={VARS}
                minHeight={140}
              />
            )}

            {/* Signature preview */}
            {emailSignature && (
              <div className="mt-2 rounded-xl bg-muted/20 border border-border/20 p-3 space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Signature (appended automatically)
                </p>
                <div className="border-t border-border/20 pt-2">
                  <p className="text-[10px] text-muted-foreground/50 font-mono mb-1">--</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{emailSignature}</p>
                </div>
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFiles} />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5" /> Attach files
            </button>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs bg-muted/50 border border-border/30 rounded-lg px-2 py-1">
                    <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-foreground max-w-[120px] truncate">{a.filename}</span>
                    <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                    <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="rounded-xl bg-muted/40 border border-border/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground">Schedule as follow-up</span>
              </div>
              <button
                onClick={() => {
                  const next = !scheduleMode
                  setScheduleMode(next)
                  if (!next) { setScheduledFor(""); setSchedulePreset(null) }
                }}
                className={cn(
                  "w-9 h-5 rounded-full transition-all relative",
                  scheduleMode ? "bg-primary" : "bg-muted/60"
                )}
              >
                <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", scheduleMode ? "left-4" : "left-0.5")} />
              </button>
            </div>
            {scheduleMode && (
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  {SCHEDULE_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setSchedulePreset(preset.label)
                        setScheduledFor(preset.getValue())
                      }}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full border transition-all",
                        schedulePreset === preset.label
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "text-muted-foreground border-border/30 hover:border-border"
                      )}
                    >{preset.label}</button>
                  ))}
                  <button
                    onClick={() => {
                      setSchedulePreset("custom")
                      setScheduledFor("")
                    }}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border transition-all",
                      schedulePreset === "custom"
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "text-muted-foreground border-border/30 hover:border-border"
                    )}
                  >Custom</button>
                </div>
                {schedulePreset === "custom" && (
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={e => setScheduledFor(e.target.value)}
                    min={toLocalDatetimeValue(new Date(Date.now() + 60_000))}
                    className="w-full bg-muted/40 border border-border/30 rounded-xl px-3 py-2 text-sm text-foreground"
                  />
                )}
                {scheduledFor && schedulePreset !== "custom" && (
                  <p className="text-xs text-muted-foreground">{formatPresetTime(scheduledFor)}</p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 border-border/30" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-primary text-primary-foreground gap-1.5"
              onClick={() => sendMut.mutate()}
              disabled={!canSend || sendMut.isPending || !lead.email}
            >
              <Send className="w-3.5 h-3.5" />
              {sendMut.isPending
                ? "Sending…"
                : scheduleMode
                ? "Schedule"
                : "Send Now"}
            </Button>
          </div>

          {/* Preview summary */}
          {(subject || body) && (
            <div className="text-[10px] text-muted-foreground border-t border-border/20 pt-2 space-y-0.5">
              {previewSubject && <p><span className="text-foreground/50">Subject: </span>{previewSubject}</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Templates Manager Dialog ───────────────────────────────────────────────
function TemplateForm({
  initial,
  products,
  onSave,
  onCancel,
}: {
  initial?: Partial<EmailTemplate>
  products: Product[]
  onSave: (data: Partial<EmailTemplate>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [productId, setProductId] = useState<number | null>(initial?.productId ?? null)
  const [subject, setSubject] = useState(initial?.subject ?? "")
  const [body, setBody] = useState(initial?.body ?? "")
  const [isFollowUp, setIsFollowUp] = useState(initial?.isFollowUp ?? false)
  const [followUpDelayDays, setFollowUpDelayDays] = useState<number | "">(initial?.followUpDelayDays ?? "")

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false)
  const [aiContext, setAiContext] = useState("")
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState("")

  const handleGenerate = async () => {
    if (!aiContext.trim()) return
    setAiGenerating(true); setAiError("")
    try {
      const selectedProduct = products.find(p => p.id === productId)
      const res = await fetch(`${BASE}/api/generate-template`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "email",
          context: aiContext.trim(),
          productContext: selectedProduct ? `${selectedProduct.name}${(selectedProduct as any).description ? ` — ${(selectedProduct as any).description}` : ""}` : undefined,
        }),
      })
      const data = await res.json() as { subject?: string; body?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Generation failed")
      if (data.subject) setSubject(data.subject)
      if (data.body) setBody(data.body)
      setAiOpen(false)
      setAiContext("")
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setAiGenerating(false)
    }
  }

  const valid = name.trim() && subject.trim() && body.trim()

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Template name</p>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Initial outreach" className="bg-muted/40 border-border/30" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Product</p>
          <select
            value={productId ?? ""}
            onChange={e => setProductId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full bg-muted/40 border border-border/30 rounded-xl px-3 py-2 text-sm text-foreground"
          >
            <option value="">All products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* AI generation panel */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setAiOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Generate with AI</span>
            <span className="text-[10px] text-primary/50">— sounds human, not robotic</span>
          </div>
          {aiOpen ? <ChevronUp className="w-3.5 h-3.5 text-primary/50" /> : <ChevronDown className="w-3.5 h-3.5 text-primary/50" />}
        </button>
        {aiOpen && (
          <div className="px-3 pb-3 space-y-2 border-t border-primary/10">
            <p className="text-[10px] text-primary/60 pt-2">Describe the purpose of this email. Who are you reaching out to and why should they care?</p>
            <Textarea
              autoFocus
              value={aiContext}
              onChange={e => setAiContext(e.target.value)}
              placeholder="e.g. Reaching out to HR directors at mid-size tech companies who are struggling with high employee churn. Our platform reduces churn by showing managers real-time engagement signals. Looking for a quick intro call."
              className="bg-muted/40 border-border/30 text-sm min-h-[90px] resize-none text-xs"
            />
            {aiError && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />{aiError}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              className="w-full gap-2 h-9"
              disabled={!aiContext.trim() || aiGenerating}
              onClick={handleGenerate}
            >
              {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {aiGenerating ? "Writing…" : "Write my email"}
            </Button>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Subject</p>
        <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Quick intro — {{company}}" className="bg-muted/40 border-border/30" />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Body</p>
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder={`Hi {{firstName}},\n\nI'm reaching out because…`}
          variables={VARS}
          minHeight={160}
        />
      </div>

      {/* Follow-up */}
      <div className="rounded-xl bg-muted/40 border border-border/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground">Follow-up template</p>
          <button
            onClick={() => setIsFollowUp(v => !v)}
            className={cn("w-9 h-5 rounded-full transition-all relative", isFollowUp ? "bg-primary" : "bg-muted/60")}
          >
            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", isFollowUp ? "left-4" : "left-0.5")} />
          </button>
        </div>
        {isFollowUp && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground shrink-0">Send</p>
            <Input
              type="number"
              min={1}
              max={90}
              value={followUpDelayDays}
              onChange={e => setFollowUpDelayDays(e.target.value ? parseInt(e.target.value) : "")}
              className="bg-muted/40 border-border/30 w-20 text-center"
              placeholder="7"
            />
            <p className="text-xs text-muted-foreground shrink-0">days after last contact</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 border-border/30" onClick={onCancel}>Cancel</Button>
        <Button
          className="flex-1 bg-primary text-primary-foreground"
          onClick={() => onSave({ name, productId, subject, body, isFollowUp, followUpDelayDays: isFollowUp && followUpDelayDays ? Number(followUpDelayDays) : null })}
          disabled={!valid}
        >
          Save template
        </Button>
      </div>
    </div>
  )
}

export function TemplatesManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState<EmailTemplate | null | "new">(null)

  const { data: templates = [] } = useQuery({ queryKey: ["email-templates"], queryFn: fetchTemplates })
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: fetchProducts })

  const createMut = useMutation({
    mutationFn: async (data: Partial<EmailTemplate>) => {
      const res = await fetch(`${BASE}/api/email-templates`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to create template")
      return res.json()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); setEditing(null); toast({ title: "Template created" }) },
    onError: () => toast({ title: "Failed to create template", variant: "destructive" }),
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }: Partial<EmailTemplate> & { id: number }) => {
      const res = await fetch(`${BASE}/api/email-templates/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update template")
      return res.json()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); setEditing(null); toast({ title: "Template updated" }) },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/email-templates/${id}`, { method: "DELETE", credentials: "include" })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); toast({ title: "Template deleted" }) },
  })

  const productName = (id: number | null) => products.find(p => p.id === id)?.name

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Email Templates
          </DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {editing === "new" ? "New template" : `Edit: ${(editing as EmailTemplate).name}`}
            </p>
            <TemplateForm
              initial={editing === "new" ? undefined : editing as EmailTemplate}
              products={products}
              onSave={data => {
                if (editing === "new") createMut.mutate(data)
                else updateMut.mutate({ ...(editing as EmailTemplate), ...data })
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              className="w-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 gap-2"
              onClick={() => setEditing("new")}
            >
              <Plus className="w-4 h-4" /> New Template
            </Button>

            {templates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No templates yet. Create one to speed up outreach.
              </div>
            )}

            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="p-3 rounded-xl bg-muted/40 border border-border/20 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{t.name}</p>
                        {t.isFollowUp && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400">
                            +{t.followUpDelayDays}d follow-up
                          </span>
                        )}
                      </div>
                      {productName(t.productId) && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Package className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{productName(t.productId)}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditing(t)}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteMut.mutate(t.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── LinkedIn types & API ───────────────────────────────────────────────────
export interface LinkedInTemplate {
  id: number
  name: string
  type: "connection" | "message"
  body: string
  createdAt: string
}

async function fetchLinkedInTemplates(): Promise<LinkedInTemplate[]> {
  const res = await fetch(`${BASE}/api/linkedin-templates`, { credentials: "include" })
  if (!res.ok) return []
  return res.json()
}

type LinkedInLead = {
  id: number
  firstName: string
  lastName: string
  company: string | null
  title: string | null
  email: string | null
  linkedinUrl: string | null
}

function interpolateLinkedIn(text: string, lead: LinkedInLead): string {
  return text
    .replace(/\{\{firstName\}\}/gi, lead.firstName || "")
    .replace(/\{\{lastName\}\}/gi, lead.lastName || "")
    .replace(/\{\{company\}\}/gi, lead.company || "")
    .replace(/\{\{title\}\}/gi, lead.title || "")
    .replace(/\{\{email\}\}/gi, lead.email || "")
}

// ── LinkedIn Compose Dialog ────────────────────────────────────────────────
export function LinkedInComposeDialog({
  lead,
  open,
  onClose,
  onCopied,
  initialMessage,
}: {
  lead: LinkedInLead | null
  open: boolean
  onClose: () => void
  /** Called after a message is successfully copied — pass the template type */
  onCopied?: (type: "connection" | "message", note: string) => void
  /** Pre-fill the dialog with an AI-suggested message draft */
  initialMessage?: string
}) {
  const { toast } = useToast()
  const [filterType, setFilterType] = useState<"all" | "connection" | "message">("all")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // "ai" means the AI draft is selected instead of a template
  const [aiDraftSelected, setAiDraftSelected] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data: templates = [] } = useQuery({
    queryKey: ["linkedin-templates"],
    queryFn: fetchLinkedInTemplates,
    enabled: open,
  })

  const filtered = filterType === "all" ? templates : templates.filter(t => t.type === filterType)
  const selected = templates.find(t => t.id === selectedId) ?? null
  const preview = aiDraftSelected
    ? (initialMessage ?? "")
    : (selected && lead ? interpolateLinkedIn(selected.body, lead) : "")

  const handleCopy = async () => {
    if (!preview) return
    await navigator.clipboard.writeText(preview)
    setCopied(true)
    toast({ title: "Copied to clipboard", description: "Paste it into LinkedIn" })
    setTimeout(() => setCopied(false), 2000)
    if (!aiDraftSelected && selected) {
      onCopied?.(selected.type as "connection" | "message", selected.name)
    } else {
      onCopied?.("message", "AI Draft")
    }
  }

  const openLinkedIn = () => {
    if (lead?.linkedinUrl) window.open(lead.linkedinUrl, "_blank", "noopener noreferrer")
  }

  useEffect(() => {
    if (open) {
      setCopied(false)
      setFilterType("all")
      if (initialMessage) {
        // Pre-select the AI draft when an initial message is provided
        setAiDraftSelected(true)
        setSelectedId(null)
      } else {
        setAiDraftSelected(false)
        setSelectedId(null)
      }
    }
  }, [open, initialMessage])

  if (!lead) return null

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Linkedin className="w-4 h-4 text-sky-400" />
            LinkedIn — {lead.firstName} {lead.lastName}
          </DialogTitle>
        </DialogHeader>

        {!lead.linkedinUrl && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            No LinkedIn URL saved for this lead.
          </div>
        )}

        {/* AI Draft — shown when an AI-suggested message was passed in */}
        {initialMessage && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">AI Draft</p>
            <button
              onClick={() => { setAiDraftSelected(true); setSelectedId(null) }}
              className={cn(
                "w-full text-left p-3 rounded-xl border transition-all space-y-1",
                aiDraftSelected
                  ? "bg-violet-500/10 border-violet-500/30 text-violet-300"
                  : "bg-muted/40 border-border/20 text-foreground hover:bg-muted/60"
              )}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-sm font-medium">AI Suggested Message</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-violet-500/10 text-violet-400 ml-auto">Draft</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{initialMessage}</p>
            </button>
          </div>
        )}

        {/* Type filter */}
        <div className="flex gap-1.5">
          {(["all", "connection", "message"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setFilterType(t); setSelectedId(null); setAiDraftSelected(false) }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filterType === t && !aiDraftSelected
                  ? "bg-sky-400/15 text-sky-400 border border-sky-400/30"
                  : "text-muted-foreground hover:text-foreground border border-border/30"
              )}
            >
              {t === "all" ? "All" : t === "connection" ? "🤝 Connection" : "💬 Message"}
            </button>
          ))}
        </div>

        {/* Template list */}
        {templates.length === 0 ? (
          <div className="text-center py-5 text-sm text-muted-foreground">
            No LinkedIn templates yet — create some in Templates.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {filtered.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedId(p => p === t.id ? null : t.id); setAiDraftSelected(false) }}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all space-y-1",
                  selectedId === t.id && !aiDraftSelected
                    ? "bg-sky-400/10 border-sky-400/30 text-sky-300"
                    : "bg-muted/40 border-border/20 text-foreground hover:bg-muted/60"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                    t.type === "connection" ? "bg-purple-400/10 text-purple-400" : "bg-sky-400/10 text-sky-400"
                  )}>
                    {t.type === "connection" ? "Connect" : "Message"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{t.body}</p>
              </button>
            ))}
          </div>
        )}

        {/* Preview + actions */}
        {(selected || aiDraftSelected) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
            <div className="p-3 rounded-xl bg-muted/40 border border-border/20 text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {preview}
            </div>
            {selected?.type === "connection" && (
              <p className="text-[11px] text-amber-400">
                ⚠️ LinkedIn limits connection notes to 300 characters ({preview.length}/300)
              </p>
            )}
            <div className="flex gap-2">
              <Button className="flex-1 gap-2" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy message"}
              </Button>
              {lead.linkedinUrl && (
                <Button variant="outline" className="gap-2 border-sky-400/30 text-sky-400 hover:bg-sky-400/10" onClick={openLinkedIn}>
                  <ExternalLink className="w-4 h-4" />
                  Open LinkedIn
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground text-center">Copy → open LinkedIn → paste</p>
          </div>
        )}

        {!selected && !aiDraftSelected && lead.linkedinUrl && (
          <Button variant="outline" className="w-full gap-2 border-sky-400/30 text-sky-400 hover:bg-sky-400/10" onClick={openLinkedIn}>
            <ExternalLink className="w-4 h-4" />
            Open LinkedIn profile
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── LinkedIn Templates Manager ─────────────────────────────────────────────
export function LinkedInTemplatesManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState<LinkedInTemplate | "new" | null>(null)
  const [name, setName] = useState("")
  const [type, setType] = useState<"connection" | "message">("message")
  const [body, setBody] = useState("")

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false)
  const [aiContext, setAiContext] = useState("")
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState("")

  const handleLinkedInGenerate = async () => {
    if (!aiContext.trim()) return
    setAiGenerating(true); setAiError("")
    try {
      const res = await fetch(`${BASE}/api/generate-template`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: type === "connection" ? "linkedin_connection" : "linkedin_message",
          context: aiContext.trim(),
        }),
      })
      const data = await res.json() as { body?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Generation failed")
      if (data.body) setBody(data.body)
      setAiOpen(false)
      setAiContext("")
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setAiGenerating(false)
    }
  }

  const { data: templates = [] } = useQuery({
    queryKey: ["linkedin-templates"],
    queryFn: fetchLinkedInTemplates,
    enabled: open,
  })

  const startEdit = (t: LinkedInTemplate | "new") => {
    if (t === "new") { setName(""); setType("message"); setBody(""); setAiOpen(false); setAiContext(""); setAiError("") }
    else { setName(t.name); setType(t.type as "connection" | "message"); setBody(t.body); setAiOpen(false); setAiContext(""); setAiError("") }
    setEditing(t)
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !body.trim()) throw new Error("Name and body required")
      const payload = { name: name.trim(), type, body: body.trim() }
      if (editing === "new") {
        const res = await fetch(`${BASE}/api/linkedin-templates`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error("Failed to create")
        return res.json()
      } else {
        const res = await fetch(`${BASE}/api/linkedin-templates/${(editing as LinkedInTemplate).id}`, {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error("Failed to update")
        return res.json()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["linkedin-templates"] })
      toast({ title: editing === "new" ? "Template created" : "Template updated" })
      setEditing(null)
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/linkedin-templates/${id}`, { method: "DELETE", credentials: "include" })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["linkedin-templates"] }); toast({ title: "Template deleted" }) },
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Linkedin className="w-4 h-4 text-sky-400" />
            LinkedIn Templates
          </DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {editing === "new" ? "New template" : `Edit: ${(editing as LinkedInTemplate).name}`}
            </p>
            {/* Type toggle */}
            <div className="flex gap-2">
              {(["connection", "message"] as const).map(t => (
                <button key={t} onClick={() => setType(t)} className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all",
                  type === t
                    ? t === "connection" ? "bg-purple-400/15 text-purple-400 border-purple-400/30" : "bg-sky-400/15 text-sky-400 border-sky-400/30"
                    : "text-muted-foreground border-border/30 hover:border-border"
                )}>
                  {t === "connection" ? "🤝 Connection request" : "💬 Direct message"}
                </button>
              ))}
            </div>

            {/* AI generation panel */}
            <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setAiOpen(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-xs font-semibold text-sky-400">Generate with AI</span>
                  <span className="text-[10px] text-sky-400/50">— sounds human, not robotic</span>
                </div>
                {aiOpen ? <ChevronUp className="w-3.5 h-3.5 text-sky-400/50" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-400/50" />}
              </button>
              {aiOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-sky-400/10">
                  <p className="text-[10px] text-sky-400/60 pt-2">
                    {type === "connection"
                      ? "Describe why you want to connect. What do you have in common or what value can you offer them?"
                      : "What's the purpose of this message? Who are you reaching out to and why should they care?"}
                  </p>
                  <Textarea
                    autoFocus
                    value={aiContext}
                    onChange={e => setAiContext(e.target.value)}
                    placeholder={type === "connection"
                      ? "e.g. Connecting with CTOs at fintech startups who are scaling their eng team. I run a recruiting platform that cuts time-to-hire by 40%."
                      : "e.g. Following up after they viewed my profile. They're a Head of Sales at a SaaS company growing fast — I have a cold outreach tool that could help their team book more meetings."}
                    className="bg-muted/40 border-border/30 text-sm min-h-[80px] resize-none text-xs"
                  />
                  {aiError && (
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />{aiError}
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="w-full gap-2 h-9 bg-sky-400/10 text-sky-400 border border-sky-400/20 hover:bg-sky-400/20"
                    disabled={!aiContext.trim() || aiGenerating}
                    onClick={handleLinkedInGenerate}
                  >
                    {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {aiGenerating ? "Writing…" : `Write my ${type === "connection" ? "connection note" : "message"}`}
                  </Button>
                </div>
              )}
            </div>

            <Input placeholder="Template name" value={name} onChange={e => setName(e.target.value)} className="bg-muted/40 border-border/30" />
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {VARS.map(v => (
                  <button key={v} onClick={() => setBody(p => p + v)}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 font-mono transition-colors">
                    {v}
                  </button>
                ))}
              </div>
              <Textarea
                placeholder={type === "connection"
                  ? "Hi {{firstName}}, I came across your work at {{company}} and would love to connect…"
                  : "Hi {{firstName}}, I wanted to reach out regarding…"}
                value={body}
                onChange={e => setBody(e.target.value)}
                className="bg-muted/40 border-border/30 text-sm min-h-[120px] resize-none"
              />
              {type === "connection" && (
                <p className={cn("text-[11px]", body.length > 300 ? "text-red-400" : "text-muted-foreground")}>
                  {body.length}/300 characters {body.length > 300 ? "— too long for a connection note" : ""}
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim() || !body.trim()}>
                {saveMut.isPending ? "Saving…" : "Save template"}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button className="w-full bg-sky-400/10 text-sky-400 border border-sky-400/20 hover:bg-sky-400/20 gap-2" onClick={() => startEdit("new")}>
              <Plus className="w-4 h-4" /> New LinkedIn Template
            </Button>
            {templates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No LinkedIn templates yet. Create one to speed up outreach.
              </div>
            )}
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="p-3 rounded-xl bg-muted/40 border border-border/20 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                        t.type === "connection" ? "bg-purple-400/10 text-purple-400" : "bg-sky-400/10 text-sky-400"
                      )}>
                        {t.type === "connection" ? "Connect" : "Message"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(t)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteMut.mutate(t.id)} className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const RECENCY_DAYS = 3
