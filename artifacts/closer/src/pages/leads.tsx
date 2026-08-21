import { useState, useRef, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  Plus, Upload, Phone, Mail, Linkedin, Users, ChevronRight,
  ChevronLeft, X, Clock, CheckCircle2, MessageSquare, Calendar,
  Trash2, MoreVertical, FileText, Send, Package,
  BarChart2, CheckSquare2, Square, UserPlus, Pencil, Save, Loader2, MapPin,
  Sparkles, Copy, Check, Link2, Handshake, PackageOpen, ArrowDownUp, Tags
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { EmailComposeDialog, TemplatesManagerDialog, EmailHistory, LinkedInComposeDialog, LinkedInTemplatesManagerDialog, BulkScheduleDialog, JournalView } from "./leads-email"
import { SequenceManagerDialog, EnrollInSequenceDialog } from "./leads-sequences"
import { useListProducts } from "@workspace/api-client-react"
import { useAuth } from "@/hooks/use-auth"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

// ── Types ──────────────────────────────────────────────────────────────────
interface Lead {
  id: number
  firstName: string
  lastName: string
  email: string | null
  company: string | null
  title: string | null
  phone: string | null
  linkedinUrl: string | null
  apolloId: string | null
  status: string
  leadType: "end_user" | "reseller"
  lastActionType: string | null
  lastActionNote: string | null
  lastActionAt: string | null
  notes: string | null
  assignedToUserId: string | null
  productId?: number | null
  createdAt: string
  tags: LeadTag[]
}

interface LeadTag {
  id: number
  name: string
  leadCount?: number
}

type ActionType = "call" | "email" | "linkedin" | "meeting" | "sms"
type LeadStatus = "new" | "contacted" | "qualified" | "not_interested" | "converted"

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:            { label: "New",           color: "text-blue-400",   bg: "bg-blue-400/10" },
  contacted:      { label: "Contacted",     color: "text-amber-400",  bg: "bg-amber-400/10" },
  qualified:      { label: "Qualified",     color: "text-emerald-400",bg: "bg-emerald-400/10" },
  not_interested: { label: "Not Interested",color: "text-red-400",    bg: "bg-red-400/10" },
  converted:      { label: "Converted",     color: "text-purple-400", bg: "bg-purple-400/10" },
}

const ACTION_CONFIG: Record<ActionType, { label: string; icon: typeof Phone; color: string }> = {
  call:     { label: "Call",     icon: Phone,        color: "text-emerald-400" },
  email:    { label: "Email",    icon: Mail,         color: "text-blue-400" },
  linkedin: { label: "LinkedIn", icon: Linkedin,     color: "text-sky-400" },
  meeting:  { label: "Meeting",  icon: Calendar,     color: "text-purple-400" },
  sms:      { label: "SMS",      icon: MessageSquare,color: "text-amber-400" },
}

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "all",            label: "All" },
  { key: "new",            label: "New" },
  { key: "contacted",      label: "Contacted" },
  { key: "qualified",      label: "Qualified" },
  { key: "not_interested", label: "Not Interested" },
  { key: "converted",      label: "Converted" },
]

const LEAD_TYPE_TABS: Array<{ key: "all" | "end_user" | "reseller"; label: string }> = [
  { key: "all",       label: "All types" },
  { key: "end_user",  label: "End Users" },
  { key: "reseller",  label: "Resellers" },
]

// ── Helpers ────────────────────────────────────────────────────────────────
function fullName(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unknown"
}

function initials(lead: Lead) {
  return [lead.firstName?.[0], lead.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?"
}

function timeAgo(date: string | null) {
  if (!date) return null
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }) } catch { return null }
}

function CreateContactListDialog({
  open,
  onClose,
  leadIds,
  productId,
}: {
  open: boolean
  onClose: () => void
  leadIds: number[]
  productId: number | null
}) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Give the list a name", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`${BASE}/api/contact-lists`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), productId, leadIds }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Could not create contact list")
      await qc.invalidateQueries({ queryKey: ["contact-lists"] })
      toast({ title: "Contact list saved", description: `${result.memberCount} selected lead${result.memberCount === 1 ? "" : "s"} added to ${result.name}.` })
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
        <DialogHeader>
          <DialogTitle>Save selected leads as a contact list</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">This named list can be reused whenever you launch a sequence campaign.</p>
        <Input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. UK decision makers – Q4" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !leadIds.length} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save {leadIds.length} lead{leadIds.length === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── API ────────────────────────────────────────────────────────────────────
async function fetchLeads(
  status: string,
  search: string,
  productId: number | "all",
  leadType: "all" | "end_user" | "reseller",
  tagIds: number[],
  tagMatch: "any" | "all",
): Promise<Lead[]> {
  const params = new URLSearchParams()
  if (status !== "all") params.set("status", status)
  if (search) params.set("search", search)
  if (productId !== "all") params.set("productId", String(productId))
  if (leadType !== "all") params.set("leadType", leadType)
  if (tagIds.length) {
    params.set("tagIds", tagIds.join(","))
    params.set("tagMatch", tagMatch)
  }
  const res = await fetch(`${BASE}/api/leads?${params}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch leads")
  return res.json()
}

async function createLead(data: Partial<Lead>): Promise<Lead> {
  const res = await fetch(`${BASE}/api/leads`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create lead")
  return res.json()
}

async function patchLead(id: number, data: Record<string, unknown>): Promise<Lead> {
  const res = await fetch(`${BASE}/api/leads/${id}`, {
    method: "PATCH", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update lead")
  return res.json()
}

async function deleteLead(id: number): Promise<void> {
  await fetch(`${BASE}/api/leads/${id}`, { method: "DELETE", credentials: "include" })
}

interface AiSuggestion {
  opener: string
  approach: "value_link" | "collaboration" | "product_intro"
  approachLabel: string
  subject?: string
  message: string
  link?: string
}

async function fetchAiAssistant(leadId: number): Promise<AiSuggestion> {
  const res = await fetch(`${BASE}/api/leads/${leadId}/ai-assistant`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) throw new Error("AI assistant failed")
  return res.json()
}

async function importApollo(
  csv: string,
  productId: number | null,
  leadType: "end_user" | "reseller",
  tagIds: number[],
  onProgress: (processed: number, total: number) => void,
): Promise<{ imported: number; updated: number }> {
  const res = await fetch(`${BASE}/api/leads/import-apollo`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv, productId, leadType, tagIds }),
  })
  if (!res.ok) throw new Error("Import failed")

  // The endpoint streams Server-Sent Events; consume them to drive the progress bar
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result = { imported: 0, updated: 0 }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const event = JSON.parse(line.slice(6))
      if (event.type === "progress") {
        onProgress(event.processed as number, event.total as number)
      } else if (event.type === "done") {
        result = { imported: event.imported, updated: event.updated }
      } else if (event.type === "error") {
        throw new Error(event.message ?? "Import failed")
      }
    }
  }

  return result
}

function TagPicker({
  value,
  onChange,
  label = "Tags",
  allowCreate = true,
}: {
  value: number[]
  onChange: (tagIds: number[]) => void
  label?: string
  allowCreate?: boolean
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const { data: tags = [] } = useQuery<LeadTag[]>({
    queryKey: ["lead-tags"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lead-tags`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load tags")
      return res.json()
    },
  })
  const selected = tags.filter(tag => value.includes(tag.id))
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter(tagId => tagId !== id) : [...value, id])
  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`${BASE}/api/lead-tags`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      })
      const tag = await res.json()
      if (!res.ok) throw new Error(tag.error || "Could not create tag")
      await qc.invalidateQueries({ queryKey: ["lead-tags"] })
      if (!value.includes(tag.id)) onChange([...value, tag.id])
      setNewName("")
    } catch (error) {
      toast({ title: "Could not create tag", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(tag => (
            <button key={tag.id} type="button" onClick={() => toggle(tag.id)} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20">
              {tag.name}<X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.filter(tag => !value.includes(tag.id)).map(tag => (
            <button key={tag.id} type="button" onClick={() => toggle(tag.id)} className="rounded-full border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary">
              + {tag.name}
            </button>
          ))}
        </div>
      )}
      {allowCreate && (
        <div className="flex gap-2">
          <Input value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); create() } }} placeholder="Create a new tag…" maxLength={64} className="h-8 bg-muted/40 text-xs" />
          <Button type="button" size="sm" variant="outline" onClick={create} disabled={creating || !newName.trim()} className="h-8 px-2 text-xs">
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Apollo Import Dialog ───────────────────────────────────────────────────
function ApolloImportDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (productId: number | null, leadType: "end_user" | "reseller", tagIds: number[]) => void
}) {
  const { data: products = [] } = useListProducts()
  const [selected, setSelected] = useState<number | null>(null)
  const [leadType, setLeadType] = useState<"end_user" | "reseller">("end_user")
  const [tagIds, setTagIds] = useState<number[]>([])

  function handleConfirm() {
    onConfirm(selected, leadType, tagIds)
    setSelected(null)
    setLeadType("end_user")
    setTagIds([])
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setSelected(null); onClose() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Import Apollo CSV</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Which product are these leads for? You can skip this if they're not tied to a specific product.
        </p>

        <div className="space-y-2 max-h-64 overflow-y-auto py-1">
          {/* No product option */}
          <button
            onClick={() => setSelected(null)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors",
              selected === null
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/30 hover:border-border/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium">No specific product</span>
            {selected === null && <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />}
          </button>

          {products.map(p => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors",
                selected === p.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/30 hover:border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{p.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                {p.tagline && <p className="text-xs text-muted-foreground truncate">{p.tagline}</p>}
              </div>
              {selected === p.id && <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />}
            </button>
          ))}
        </div>

        {/* Lead type picker */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Lead type</p>
          <div className="grid grid-cols-2 gap-2">
            {(["end_user", "reseller"] as const).map(lt => (
              <button
                key={lt}
                onClick={() => setLeadType(lt)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors",
                  leadType === lt
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/30 hover:border-border/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {lt === "end_user" ? <Users className="w-3.5 h-3.5 shrink-0" /> : <Handshake className="w-3.5 h-3.5 shrink-0" />}
                {lt === "end_user" ? "End User" : "Reseller"}
                {leadType === lt && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
        <TagPicker value={tagIds} onChange={setTagIds} label="Tags to add to every imported lead" />

        <Button className="w-full" onClick={handleConfirm}>
          <Upload className="w-4 h-4 mr-2" /> Choose CSV file
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Lead Dialog ────────────────────────────────────────────────────────
function AddLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: products = [] } = useListProducts()
  const emptyForm = { firstName: "", lastName: "", email: "", company: "", title: "", phone: "", linkedinUrl: "", companyLinkedinUrl: "", instagramUrl: "", facebookUrl: "", tiktokUrl: "", address: "", productId: null as number | null, leadType: "end_user" as "end_user" | "reseller", tagIds: [] as number[] }
  const [form, setForm] = useState(emptyForm)
  const [pastedImage, setPastedImage] = useState<string | null>(null) // data URL for preview
  const [scanning, setScanning] = useState(false)

  // Listen for paste events while the dialog is open
  const handlePaste = async (e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imageItem = items.find(it => it.type.startsWith("image/"))
    if (!imageItem) return
    e.preventDefault()

    const file = imageItem.getAsFile()
    if (!file) return

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = () => setPastedImage(reader.result as string)
    reader.readAsDataURL(file)

    // Convert to base64 and call extraction endpoint
    const arrayBuffer = await file.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    setScanning(true)
    try {
      const res = await fetch(`${BASE}/api/leads/extract-from-image`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      })
      if (!res.ok) throw new Error("Extraction failed")
      const data = await res.json()
      setForm(prev => ({
        ...prev,
        firstName: data.firstName || prev.firstName,
        lastName: data.lastName || prev.lastName,
        email: data.email || prev.email,
        phone: data.phone || prev.phone,
        linkedinUrl: data.linkedinUrl || prev.linkedinUrl,
        company: data.company || prev.company,
        title: data.title || prev.title,
      }))
      toast({ title: "Contact details extracted", description: "Review the fields below and adjust if needed." })
    } catch {
      toast({ title: "Couldn't read the image", description: "Fill in the fields manually.", variant: "destructive" })
    } finally {
      setScanning(false)
    }
  }

  // Register/unregister paste listener when open changes
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    document.addEventListener("paste", handlePaste)
    return () => document.removeEventListener("paste", handlePaste)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const mut = useMutation({
    mutationFn: () => createLead(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] })
      toast({ title: "Lead added" })
      onClose()
      setForm(emptyForm)
      setPastedImage(null)
    },
    onError: () => toast({ title: "Failed to add lead", variant: "destructive" }),
  })

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setPastedImage(null) } }}>
      <DialogContent className="bg-card border-border/30 max-w-md max-h-[90dvh] overflow-y-auto" ref={dialogRef}>
        <DialogHeader>
          <DialogTitle className="text-foreground">Add Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">

          {/* Paste-image zone */}
          {pastedImage ? (
            <div className="relative rounded-xl overflow-hidden border border-border/30 bg-muted/40">
              <img src={pastedImage} alt="Pasted" className="w-full max-h-40 object-contain" />
              {scanning && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-sm text-white">
                  <Loader2 className="w-4 h-4 animate-spin" /> Scanning…
                </div>
              )}
              {!scanning && (
                <button
                  onClick={() => setPastedImage(null)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="w-full rounded-xl border border-dashed border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors px-4 py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground"
              onClick={() => toast({ title: "Copy a screenshot first, then press Ctrl+V / ⌘V anywhere in this form." })}
            >
              <span className="text-base">📋</span>
              Paste a LinkedIn screenshot to auto-fill
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">First name</p>
              <Input value={form.firstName} onChange={f("firstName")} placeholder="Jane" className="bg-muted/40 border-border/30" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Last name</p>
              <Input value={form.lastName} onChange={f("lastName")} placeholder="Smith" className="bg-muted/40 border-border/30" />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Email</p>
            <Input value={form.email} onChange={f("email")} placeholder="jane@company.com" type="email" className="bg-muted/40 border-border/30" />
          </div>
          <TagPicker value={form.tagIds} onChange={tagIds => setForm(current => ({ ...current, tagIds }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Company</p>
              <Input value={form.company} onChange={f("company")} placeholder="Acme Corp" className="bg-muted/40 border-border/30" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Title</p>
              <Input value={form.title} onChange={f("title")} placeholder="CEO" className="bg-muted/40 border-border/30" />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Phone</p>
            <Input value={form.phone} onChange={f("phone")} placeholder="+44 7700 000000" className="bg-muted/40 border-border/30" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">LinkedIn URL</p>
            <Input value={form.linkedinUrl} onChange={f("linkedinUrl")} placeholder="https://linkedin.com/in/..." className="bg-muted/40 border-border/30" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Company LinkedIn URL</p>
            <Input value={form.companyLinkedinUrl} onChange={f("companyLinkedinUrl")} placeholder="https://linkedin.com/company/..." className="bg-muted/40 border-border/30" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Instagram</p>
              <Input value={form.instagramUrl} onChange={f("instagramUrl")} placeholder="https://instagram.com/..." className="bg-muted/40 border-border/30" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Facebook</p>
              <Input value={form.facebookUrl} onChange={f("facebookUrl")} placeholder="https://facebook.com/..." className="bg-muted/40 border-border/30" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">TikTok</p>
              <Input value={form.tiktokUrl} onChange={f("tiktokUrl")} placeholder="https://tiktok.com/@..." className="bg-muted/40 border-border/30" />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Address</p>
            <Input value={form.address} onChange={f("address")} placeholder="123 High Street, London, EC1A 1BB" className="bg-muted/40 border-border/30" />
          </div>

          {/* Lead type selector */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Lead type</p>
            <div className="flex gap-2">
              {(["end_user", "reseller"] as const).map(lt => (
                <button
                  key={lt}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, leadType: lt }))}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5",
                    form.leadType === lt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground"
                  )}
                >
                  {lt === "end_user" ? <Users className="w-3 h-3" /> : <Handshake className="w-3 h-3" />}
                  {lt === "end_user" ? "End User" : "Reseller"}
                </button>
              ))}
            </div>
          </div>

          {/* Product selector — only shown when at least one product exists */}
          {products.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Product</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, productId: null }))}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                    form.productId === null
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground"
                  )}
                >
                  None
                </button>
                {products.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, productId: p.id }))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                      form.productId === p.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground"
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 border-border/30" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1 bg-primary text-primary-foreground"
              onClick={() => mut.mutate()}
              disabled={mut.isPending || scanning || (!form.firstName && !form.lastName && !form.email)}
            >
              {mut.isPending ? "Adding…" : "Add Lead"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Lead Detail Dialog ─────────────────────────────────────────────────────
function LeadDetailDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [actionNote, setActionNote] = useState("")
  const [notes, setNotes] = useState(lead?.notes ?? "")
  const [status, setStatus] = useState<string>(lead?.status ?? "new")
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", phone: "", linkedinUrl: "", companyLinkedinUrl: "", instagramUrl: "", facebookUrl: "", tiktokUrl: "", address: "", company: "", title: "", notes: "", leadType: "end_user" as "end_user" | "reseller", tagIds: [] as number[] })
  const [emailOpen, setEmailOpen] = useState(false)

  // Sync when lead changes
  const leadId = lead?.id
  if (lead && lead.id !== leadId) {
    setNotes(lead.notes ?? "")
    setStatus(lead.status)
  }

  const patchMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => patchLead(lead!.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteLead(lead!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] })
      toast({ title: "Lead deleted" })
      onClose()
    },
  })

  const logAction = () => {
    if (!actionType) return
    patchMut.mutate(
      { logAction: true, lastActionType: actionType, lastActionNote: actionNote },
      {
        onSuccess: () => {
          toast({ title: "Action logged" })
          setActionType(null)
          setActionNote("")
        },
      }
    )
  }

  const saveNotes = () => patchMut.mutate({ notes }, { onSuccess: () => toast({ title: "Notes saved" }) })
  const changeStatus = (s: string) => {
    setStatus(s)
    patchMut.mutate({ status: s })
  }

  if (!lead) return null

  const sc = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new

  return (
    <Dialog open={!!lead} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-md max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-3 pt-2 pr-8">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-sm">{initials(lead)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-base leading-tight">{fullName(lead)}</p>
            {lead.title && <p className="text-xs text-muted-foreground mt-0.5">{lead.title}</p>}
            {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground p-1">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => {
                setEditForm({
                  firstName: lead.firstName ?? "",
                  lastName: lead.lastName ?? "",
                  email: lead.email ?? "",
                  phone: lead.phone ?? "",
                  linkedinUrl: lead.linkedinUrl ?? "",
                  companyLinkedinUrl: (lead as any).companyLinkedinUrl ?? "",
                  instagramUrl: (lead as any).instagramUrl ?? "",
                  facebookUrl: (lead as any).facebookUrl ?? "",
                  tiktokUrl: (lead as any).tiktokUrl ?? "",
                  address: (lead as any).address ?? "",
                  company: lead.company ?? "",
                  title: lead.title ?? "",
                  notes: lead.notes ?? "",
                  leadType: lead.leadType ?? "end_user",
                  tagIds: lead.tags.map(tag => tag.id),
                })
                setShowEdit(true)
              }}>
                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit contact
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => deleteMut.mutate()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showEdit && (
          <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/20 px-4 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit contact</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">First name</label>
                <Input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="Jane" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Last name</label>
                <Input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="Smith" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Email</label>
              <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} type="email" className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="jane@company.com" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Phone</label>
              <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="+44 7700 000000" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">LinkedIn URL</label>
              <Input value={editForm.linkedinUrl} onChange={e => setEditForm(f => ({ ...f, linkedinUrl: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="https://linkedin.com/in/..." />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Company LinkedIn URL</label>
              <Input value={editForm.companyLinkedinUrl} onChange={e => setEditForm(f => ({ ...f, companyLinkedinUrl: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="https://linkedin.com/company/..." />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Instagram</label>
                <Input value={editForm.instagramUrl} onChange={e => setEditForm(f => ({ ...f, instagramUrl: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="https://instagram.com/..." />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Facebook</label>
                <Input value={editForm.facebookUrl} onChange={e => setEditForm(f => ({ ...f, facebookUrl: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="https://facebook.com/..." />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">TikTok</label>
                <Input value={editForm.tiktokUrl} onChange={e => setEditForm(f => ({ ...f, tiktokUrl: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="https://tiktok.com/@..." />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Address</label>
              <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="123 High Street, London" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Company</label>
                <Input value={editForm.company} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="Acme Corp" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Title</label>
                <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="h-9 rounded-xl bg-muted/40 border-border/30 text-sm" placeholder="CEO" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Notes</label>
              <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="rounded-xl bg-muted/40 border-border/30 text-sm resize-none" placeholder="Anything worth remembering…" />
            </div>
            <TagPicker value={editForm.tagIds} onChange={tagIds => setEditForm(form => ({ ...form, tagIds }))} />
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Lead type</label>
              <div className="flex gap-2">
                {(["end_user", "reseller"] as const).map(lt => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, leadType: lt }))}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                      editForm.leadType === lt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground"
                    )}
                  >
                    {lt === "end_user" ? <Users className="w-3 h-3" /> : <Handshake className="w-3 h-3" />}
                    {lt === "end_user" ? "End User" : "Reseller"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)} className="flex-1 h-9 rounded-xl text-xs">Cancel</Button>
              <Button size="sm" disabled={patchMut.isPending} onClick={() => {
                patchMut.mutate(
                  {
                    firstName: editForm.firstName.trim() || undefined,
                    lastName: editForm.lastName.trim() || undefined,
                    email: editForm.email.trim() || null,
                    phone: editForm.phone.trim() || null,
                    linkedinUrl: editForm.linkedinUrl.trim() || null,
                    companyLinkedinUrl: editForm.companyLinkedinUrl.trim() || null,
                    instagramUrl: editForm.instagramUrl.trim() || null,
                    facebookUrl: editForm.facebookUrl.trim() || null,
                    tiktokUrl: editForm.tiktokUrl.trim() || null,
                    address: editForm.address.trim() || null,
                    company: editForm.company.trim() || null,
                    title: editForm.title.trim() || null,
                    notes: editForm.notes.trim() || null,
                    leadType: editForm.leadType,
                    tagIds: editForm.tagIds,
                  },
                  { onSuccess: () => { toast({ title: "Contact updated" }); setShowEdit(false) } }
                )
              }} className="flex-1 h-9 rounded-xl text-xs gap-1.5">
                {patchMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </div>
        )}

        {lead.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map(tag => <span key={tag.id} className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">{tag.name}</span>)}
          </div>
        )}

        {/* Contact links */}
        <div className="flex flex-wrap gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2.5 py-1.5 rounded-lg hover:bg-emerald-400/20">
              <Phone className="w-3 h-3" /> {lead.phone}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-400/10 px-2.5 py-1.5 rounded-lg hover:bg-blue-400/20">
              <Mail className="w-3 h-3" /> {lead.email}
            </a>
          )}
          {lead.linkedinUrl && (
            <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-400 bg-sky-400/10 px-2.5 py-1.5 rounded-lg hover:bg-sky-400/20">
              <Linkedin className="w-3 h-3" /> LinkedIn
            </a>
          )}
          {(lead as any).companyLinkedinUrl && (
            <a href={(lead as any).companyLinkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 bg-sky-300/10 px-2.5 py-1.5 rounded-lg hover:bg-sky-300/20">
              <Linkedin className="w-3 h-3" /> Co. LinkedIn
            </a>
          )}
          {(lead as any).instagramUrl && (
            <a href={(lead as any).instagramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-pink-400 bg-pink-400/10 px-2.5 py-1.5 rounded-lg hover:bg-pink-400/20">
              <span className="text-[10px] font-bold">IG</span> Instagram
            </a>
          )}
          {(lead as any).facebookUrl && (
            <a href={(lead as any).facebookUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-400/10 px-2.5 py-1.5 rounded-lg hover:bg-indigo-400/20">
              <span className="text-[10px] font-bold">FB</span> Facebook
            </a>
          )}
          {(lead as any).tiktokUrl && (
            <a href={(lead as any).tiktokUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-fuchsia-400 bg-fuchsia-400/10 px-2.5 py-1.5 rounded-lg hover:bg-fuchsia-400/20">
              <span className="text-[10px] font-bold">TT</span> TikTok
            </a>
          )}
          {(lead as any).address && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded-lg">
              <MapPin className="w-3 h-3" /> {(lead as any).address}
            </span>
          )}
          <button
            onClick={() => setEmailOpen(true)}
            className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2.5 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
          >
            <Send className="w-3 h-3" /> Send Email
          </button>
        </div>

        {/* Email compose (nested so it has lead context) */}
        <EmailComposeDialog lead={lead} open={emailOpen} onClose={() => setEmailOpen(false)} />

        {/* Status */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => changeStatus(key)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-all",
                  status === key
                    ? `${cfg.color} ${cfg.bg} border-current/30`
                    : "text-muted-foreground border-border/30 hover:border-border"
                )}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Last action */}
        {lead.lastActionAt && (
          <div className="rounded-xl bg-muted/40 border border-border/20 p-3">
            <p className="text-xs text-muted-foreground mb-1">Last Action</p>
            <div className="flex items-center gap-2">
              {lead.lastActionType && (() => {
                const ac = ACTION_CONFIG[lead.lastActionType as ActionType]
                if (!ac) return null
                const Icon = ac.icon
                return <Icon className={cn("w-3.5 h-3.5 shrink-0", ac.color)} />
              })()}
              <span className="text-sm text-foreground font-medium capitalize">{lead.lastActionType}</span>
              <span className="text-xs text-muted-foreground ml-auto">{timeAgo(lead.lastActionAt)}</span>
            </div>
            {lead.lastActionNote && <p className="text-xs text-muted-foreground mt-1.5">{lead.lastActionNote}</p>}
          </div>
        )}

        {/* Log action */}
        <div className="rounded-xl bg-muted/40 border border-border/20 p-3 space-y-3">
          <p className="text-xs font-medium text-foreground">Log Action</p>
          <div className="grid grid-cols-5 gap-1.5">
            {(Object.entries(ACTION_CONFIG) as [ActionType, (typeof ACTION_CONFIG)[ActionType]][]).map(([key, cfg]) => {
              const Icon = cfg.icon
              return (
                <button
                  key={key}
                  onClick={() => setActionType(p => p === key ? null : key)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 rounded-xl border text-xs transition-all",
                    actionType === key
                      ? `${cfg.color} border-current/40 bg-muted/60`
                      : "text-muted-foreground border-border/30 hover:border-border"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{cfg.label}</span>
                </button>
              )
            })}
          </div>
          {actionType && (
            <>
              <Textarea
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder="What happened? Any key takeaways…"
                className="bg-muted/40 border-border/30 text-sm min-h-[80px] resize-none"
              />
              <Button
                className="w-full bg-primary text-primary-foreground"
                onClick={logAction}
                disabled={patchMut.isPending}
              >
                {patchMut.isPending ? "Saving…" : "Log Action"}
              </Button>
            </>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Notes</p>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any background, context, or next steps…"
            className="bg-muted/40 border-border/30 text-sm min-h-[80px] resize-none"
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-2 border-border/30"
            onClick={saveNotes}
            disabled={patchMut.isPending}
          >
            Save notes
          </Button>
        </div>

        {/* Assign to team member (owner only) */}
        <AssignLeadSection lead={lead} onAssigned={() => qc.invalidateQueries({ queryKey: ["leads"] })} />

        {/* Email history */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Email History</p>
          <EmailHistory leadId={lead.id} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Bulk Assign Dialog ─────────────────────────────────────────────────────
function BulkAssignDialog({
  open,
  leadIds,
  onClose,
}: {
  open: boolean
  leadIds: number[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: teamMembers = [] } = useQuery<TeamMemberWithAccount[]>({
    queryKey: ["team"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/team`, { credentials: "include" })
      if (!res.ok) return []
      return res.json()
    },
    enabled: open,
  })

  const membersWithAccounts = teamMembers.filter(m => m.userId)

  const handleAssign = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${BASE}/api/leads/bulk-assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds, assignedToUserId: selectedUserId }),
      })
      if (!res.ok) throw new Error("Failed")
      const member = membersWithAccounts.find(m => m.userId === selectedUserId)
      toast({
        title: selectedUserId
          ? `${leadIds.length} lead${leadIds.length !== 1 ? "s" : ""} assigned to ${member?.name}`
          : `${leadIds.length} lead${leadIds.length !== 1 ? "s" : ""} unassigned`,
      })
      qc.invalidateQueries({ queryKey: ["leads"] })
      onClose()
    } catch {
      toast({ title: "Failed to assign leads", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Assign {leadIds.length} lead{leadIds.length !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Pick a team member to take ownership of these leads.
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto py-0.5">
          {/* Unassigned option */}
          <button
            type="button"
            onClick={() => setSelectedUserId(null)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors",
              selectedUserId === null
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/30 hover:border-border/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium">Unassigned</span>
            {selectedUserId === null && <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />}
          </button>

          {membersWithAccounts.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedUserId(m.userId!)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors",
                selectedUserId === m.userId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/30 hover:border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">
                  {m.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium text-foreground">{m.name}</span>
              {selectedUserId === m.userId && <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />}
            </button>
          ))}

          {membersWithAccounts.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No team members with accounts yet. Invite someone from Settings.
            </p>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 border-border/30" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 bg-primary text-primary-foreground"
            onClick={handleAssign}
            disabled={saving || membersWithAccounts.length === 0}
          >
            {saving ? "Assigning…" : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Assign Lead to Team Member ─────────────────────────────────────────────
interface TeamMemberWithAccount {
  id: number
  name: string
  role: string
  userId: string | null
}

function AssignLeadSection({ lead, onAssigned }: { lead: Lead; onAssigned: () => void }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const { data: teamMembers = [] } = useQuery<TeamMemberWithAccount[]>({
    queryKey: ["team"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/team`, { credentials: "include" })
      if (!res.ok) return []
      return res.json()
    },
  })

  // Only show members that have user accounts
  const membersWithAccounts = teamMembers.filter(m => m.userId)

  if (user?.role !== "owner" || membersWithAccounts.length === 0) return null

  const currentMember = membersWithAccounts.find(m => m.userId === lead.assignedToUserId)

  const assign = async (userId: string | null) => {
    setSaving(true)
    try {
      const res = await fetch(`${BASE}/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assignedToUserId: userId }),
      })
      if (res.ok) {
        toast({ title: userId ? `Assigned to ${membersWithAccounts.find(m => m.userId === userId)?.name}` : "Unassigned" })
        onAssigned()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Assign to</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => assign(null)}
          disabled={saving}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border transition-all",
            !lead.assignedToUserId
              ? "text-foreground border-border bg-muted/60"
              : "text-muted-foreground border-border/30 hover:border-border"
          )}
        >
          Unassigned
        </button>
        {membersWithAccounts.map(m => (
          <button
            key={m.id}
            onClick={() => assign(m.userId!)}
            disabled={saving}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border transition-all",
              lead.assignedToUserId === m.userId
                ? "text-primary border-primary/40 bg-primary/10"
                : "text-muted-foreground border-border/30 hover:border-border hover:text-foreground"
            )}
          >
            {m.name}
          </button>
        ))}
      </div>
      {currentMember && (
        <p className="text-xs text-primary/70 mt-1.5">Assigned to {currentMember.name}</p>
      )}
    </div>
  )
}

// ── Work Mode ──────────────────────────────────────────────────────────────
function WorkMode({ leads, onClose, batchSize }: { leads: Lead[]; onClose: () => void; batchSize: number | null }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [idx, setIdx] = useState(0)
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [actionNote, setActionNote] = useState("")
  const [emailOpen, setEmailOpen] = useState(false)
  const [linkedinMsgOpen, setLinkedinMsgOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiSuggestion | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // AI draft pre-fill — set before opening a compose dialog
  const [aiDraftBody, setAiDraftBody] = useState<string | undefined>(undefined)
  const [aiDraftSubject, setAiDraftSubject] = useState<string | undefined>(undefined)

  const workLeads = useMemo(() => {
    const all = leads.filter(l => l.status === "new" || l.status === "contacted")
    return batchSize ? all.slice(0, batchSize) : all
  }, [leads, batchSize])

  const lead = workLeads[idx] ?? null

  const patchMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => patchLead(lead!.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  })

  const next = () => {
    setIdx(p => Math.min(p + 1, workLeads.length - 1))
    setActionType(null)
    setActionNote("")
    setAiOpen(false)
    setAiResult(null)
    setAiError(null)
    setAiDraftBody(undefined)
    setAiDraftSubject(undefined)
  }

  const openAiAssistant = async () => {
    if (!lead) return
    setAiOpen(true)
    setAiResult(null)
    setAiError(null)
    setAiLoading(true)
    setCopied(false)
    try {
      const result = await fetchAiAssistant(lead.id)
      setAiResult(result)
    } catch {
      setAiError("Couldn't generate a suggestion. Try again.")
    } finally {
      setAiLoading(false)
    }
  }

  const copyMessage = () => {
    if (!aiResult?.message) return
    navigator.clipboard.writeText(aiResult.message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const logAndNext = () => {
    if (!actionType || !lead) return
    patchMut.mutate(
      { logAction: true, lastActionType: actionType, lastActionNote: actionNote },
      { onSuccess: () => { toast({ title: "Action logged" }); next() } }
    )
  }

  const skip = () => next()

  if (!lead) {
    const isBatch = batchSize !== null && batchSize < leads.filter(l => l.status === "new" || l.status === "contacted").length
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
        <p className="text-xl font-bold text-foreground">
          {isBatch ? "Batch complete!" : "All caught up!"}
        </p>
        <p className="text-sm text-muted-foreground">
          {isBatch
            ? `You worked through your ${batchSize}-lead batch. Great session.`
            : "No new or contacted leads to work through right now."}
        </p>
        <Button onClick={onClose} className="mt-2">Done</Button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 border-b border-border/20">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Work Mode</p>
          <p className="text-sm font-medium text-foreground">{idx + 1} / {workLeads.length}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => { setIdx(p => Math.max(p - 1, 0)); setActionType(null); setActionNote("") }} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={next} disabled={idx >= workLeads.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-muted/40">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((idx + 1) / workLeads.length) * 100}%` }}
        />
      </div>

      {/* Lead card */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 max-w-lg mx-auto w-full">
        {/* Identity */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-lg">{initials(lead)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-foreground leading-tight">{fullName(lead)}</p>
            {lead.title && <p className="text-sm text-muted-foreground">{lead.title}</p>}
            {lead.company && <p className="text-sm text-primary/80">{lead.company}</p>}
          </div>
          <div className={cn("text-xs px-2.5 py-1 rounded-full", STATUS_CONFIG[lead.status]?.bg, STATUS_CONFIG[lead.status]?.color)}>
            {STATUS_CONFIG[lead.status]?.label}
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-1 gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/20 hover:bg-muted/60 transition-colors">
              <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-sm text-foreground">{lead.phone}</span>
            </a>
          )}
          {lead.email && (
            <button
              onClick={() => setEmailOpen(true)}
              className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/20 hover:bg-muted/60 transition-colors w-full text-left"
            >
              <Mail className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-sm text-foreground flex-1">{lead.email}</span>
              <Send className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          )}
          {/* LinkedIn: open profile + send message */}
          {(lead.linkedinUrl || true) && (
            <div className="flex gap-2">
              {lead.linkedinUrl && (
                <a
                  href={lead.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/20 hover:bg-muted/60 transition-colors flex-1"
                >
                  <Linkedin className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-sm text-foreground">Open LinkedIn</span>
                </a>
              )}
              <button
                onClick={() => setLinkedinMsgOpen(true)}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-sky-400/20 hover:bg-sky-400/10 transition-colors flex-1 text-left"
              >
                <MessageSquare className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-sm text-sky-400">Send message</span>
              </button>
            </div>
          )}
        </div>

        {/* AI Assistant button */}
        <button
          onClick={openAiAssistant}
          disabled={aiLoading}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all text-sm font-medium",
            aiOpen
              ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
              : "bg-muted/40 border-border/20 hover:bg-violet-500/10 hover:border-violet-500/30 text-muted-foreground hover:text-violet-300"
          )}
        >
          {aiLoading
            ? <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
            : <Sparkles className="w-4 h-4 text-violet-400" />}
          AI Assistant
        </button>

        {/* AI result panel */}
        {aiOpen && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
            {aiLoading && (
              <div className="flex items-center gap-3 p-4">
                <Loader2 className="w-4 h-4 animate-spin text-violet-400 shrink-0" />
                <p className="text-sm text-muted-foreground">Researching {lead.firstName}'s profile…</p>
              </div>
            )}
            {aiError && (
              <div className="p-4 space-y-2">
                <p className="text-sm text-red-400">{aiError}</p>
                <button onClick={openAiAssistant} className="text-xs text-violet-400 hover:text-violet-300">Try again</button>
              </div>
            )}
            {aiResult && !aiLoading && (
              <div className="p-4 space-y-3">
                {/* Approach badge */}
                <div className="flex items-center gap-2">
                  {aiResult.approach === "value_link" && <Link2 className="w-3.5 h-3.5 text-blue-400" />}
                  {aiResult.approach === "collaboration" && <Handshake className="w-3.5 h-3.5 text-emerald-400" />}
                  {aiResult.approach === "product_intro" && <PackageOpen className="w-3.5 h-3.5 text-orange-400" />}
                  <span className={cn(
                    "text-xs font-medium",
                    aiResult.approach === "value_link" && "text-blue-400",
                    aiResult.approach === "collaboration" && "text-emerald-400",
                    aiResult.approach === "product_intro" && "text-orange-400",
                  )}>
                    {aiResult.approachLabel ?? (
                      aiResult.approach === "value_link" ? "Value resource" :
                      aiResult.approach === "collaboration" ? "Collaboration / partner" :
                      "Product intro"
                    )}
                  </span>
                </div>

                {/* Opener */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Opening line</p>
                  <p className="text-sm text-foreground leading-relaxed italic">"{aiResult.opener}"</p>
                </div>

                {/* Full message */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Full message</p>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{aiResult.message}</p>
                </div>

                {/* Link (value_link approach) */}
                {aiResult.link && (
                  <a
                    href={aiResult.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 bg-blue-400/10 rounded-lg px-3 py-2 transition-colors"
                  >
                    <Link2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{aiResult.link}</span>
                  </a>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={copyMessage}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/60 hover:bg-muted text-xs text-foreground transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  {lead.email && (
                    <button
                      onClick={() => { setAiDraftBody(aiResult.message); setAiDraftSubject(aiResult.subject); setEmailOpen(true) }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-xs text-blue-300 transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Send Email
                    </button>
                  )}
                  <button
                    onClick={() => { setAiDraftBody(aiResult.message); setLinkedinMsgOpen(true) }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-xs text-sky-300 transition-colors"
                  >
                    <Linkedin className="w-3.5 h-3.5" />
                    LinkedIn
                  </button>
                  <button
                    onClick={openAiAssistant}
                    className="px-3 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-xs text-violet-300 transition-colors"
                  >
                    ↻
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Last action */}
        {lead.lastActionAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Last {lead.lastActionType} · {timeAgo(lead.lastActionAt)}</span>
            {lead.lastActionNote && <span className="truncate">— {lead.lastActionNote}</span>}
          </div>
        )}

        {/* Notes */}
        {lead.notes && (
          <div className="p-3 rounded-xl bg-muted/40 border border-border/20">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{lead.notes}</p>
          </div>
        )}

        {/* Log action */}
        <div className="rounded-xl bg-muted/40 border border-border/20 p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">What did you do?</p>
          <div className="grid grid-cols-5 gap-2">
            {(Object.entries(ACTION_CONFIG) as [ActionType, (typeof ACTION_CONFIG)[ActionType]][]).map(([key, cfg]) => {
              const Icon = cfg.icon
              return (
                <button
                  key={key}
                  onClick={() => setActionType(p => p === key ? null : key)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs transition-all",
                    actionType === key
                      ? `${cfg.color} border-current/40 bg-muted/60`
                      : "text-muted-foreground border-border/30 hover:border-border"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{cfg.label}</span>
                </button>
              )
            })}
          </div>
          {actionType && (
            <Textarea
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder="Quick note (optional)…"
              className="bg-muted/40 border-border/30 text-sm min-h-[80px] resize-none"
            />
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="px-4 pb-safe pb-6 pt-3 border-t border-border/20 space-y-2 max-w-lg mx-auto w-full">
        {actionType ? (
          <Button
            className="w-full bg-primary text-primary-foreground h-12 text-base"
            onClick={logAndNext}
            disabled={patchMut.isPending}
          >
            {patchMut.isPending ? "Saving…" : "Log & Next →"}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full border-border/30 h-12 text-base"
            onClick={skip}
          >
            Skip →
          </Button>
        )}
        <button onClick={onClose} className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">
          Exit Work Mode
        </button>
      </div>

      {/* Dialogs rendered inside Work Mode */}
      <EmailComposeDialog
        lead={lead}
        open={emailOpen}
        onClose={() => { setEmailOpen(false); setAiDraftBody(undefined); setAiDraftSubject(undefined) }}
        onSent={() => { if (aiDraftBody !== undefined) setActionType("email") }}
        initialBody={aiDraftBody}
        initialSubject={aiDraftSubject}
      />
      <LinkedInComposeDialog
        lead={lead}
        open={linkedinMsgOpen}
        onClose={() => { setLinkedinMsgOpen(false); setAiDraftBody(undefined) }}
        initialMessage={aiDraftBody}
        onCopied={(type, note) => {
          if (aiDraftBody !== undefined) {
            // Opened from AI draft — pre-select action type so rep can review and Log & Next
            setActionType("linkedin")
          } else {
            // Direct button — auto-log immediately as before
            patchMut.mutate({
              logAction: true,
              lastActionType: "linkedin",
              lastActionNote: `${type === "connection" ? "Connection request" : "Message"}: ${note}`,
            })
          }
        }}
      />
    </div>
  )
}

function BulkTagDialog({
  open,
  leadIds,
  onClose,
}: {
  open: boolean
  leadIds: number[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tagIds, setTagIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const applyTags = async () => {
    if (!tagIds.length) {
      toast({ title: "Choose at least one tag", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`${BASE}/api/leads/bulk-tags`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, tagIds }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Could not apply tags")
      await qc.invalidateQueries({ queryKey: ["leads"] })
      toast({ title: "Tags applied", description: `Added tags to ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}.` })
      setTagIds([])
      onClose()
    } catch (error) {
      toast({ title: "Could not apply tags", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add tags to selected leads</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Existing tags stay in place; these labels will be added to every selected lead.</p>
        <TagPicker value={tagIds} onChange={setTagIds} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={applyTags} disabled={saving || !tagIds.length} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Apply to {leadIds.length} lead{leadIds.length === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Lead Card ──────────────────────────────────────────────────────────────
function LeadCard({
  lead,
  onClick,
  selectable = false,
  selected = false,
  onToggle,
}: {
  lead: Lead
  onClick: () => void
  selectable?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  const sc = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new
  const lastAc = lead.lastActionType ? ACTION_CONFIG[lead.lastActionType as ActionType] : null

  return (
    <button
      onClick={selectable ? onToggle : onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left",
        selectable && selected
          ? "bg-primary/10 border-primary/30"
          : "bg-muted/40 border-border/20 hover:bg-muted/50 hover:border-border/40"
      )}
    >
      {selectable ? (
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border-2 transition-all",
          selected ? "bg-primary border-primary" : "bg-muted/40 border-border/40"
        )}>
          {selected
            ? <CheckCircle2 className="w-5 h-5 text-primary-foreground" />
            : <Square className="w-4 h-4 text-muted-foreground/40" />
          }
        </div>
      ) : (
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <span className="text-primary font-semibold text-sm">{initials(lead)}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{fullName(lead)}</p>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full shrink-0", sc.bg, sc.color)}>
            {sc.label}
          </span>
          {lead.leadType === "reseller" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-violet-400/10 text-violet-400">
              Reseller
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {[lead.title, lead.company].filter(Boolean).join(" · ")}
        </p>
        {lead.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {lead.tags.slice(0, 3).map(tag => <span key={tag.id} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">{tag.name}</span>)}
            {lead.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{lead.tags.length - 3}</span>}
          </div>
        )}
        {lead.lastActionAt && lastAc && (
          <div className="flex items-center gap-1 mt-0.5">
            {(() => { const Icon = lastAc.icon; return <Icon className={cn("w-3 h-3 shrink-0", lastAc.color)} /> })()}
            <span className="text-[10px] text-muted-foreground">{lastAc.label} · {timeAgo(lead.lastActionAt)}</span>
          </div>
        )}
      </div>
      {!selectable && <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
    </button>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const [view, setView] = useState<"leads" | "journal">("leads")
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkScheduleOpen, setBulkScheduleOpen] = useState(false)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkTagsOpen, setBulkTagsOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")
  const [productFilter, setProductFilter] = useState<number | "all">("all")
  const [leadTypeFilter, setLeadTypeFilter] = useState<"all" | "end_user" | "reseller">("all")
  const [tagFilterIds, setTagFilterIds] = useState<number[]>([])
  const [tagMatch, setTagMatch] = useState<"any" | "all">("any")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [emailLead, setEmailLead] = useState<Lead | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [linkedinTemplatesOpen, setLinkedinTemplatesOpen] = useState(false)
  const [sequencesOpen, setSequencesOpen] = useState(false)
  const [enrollSequenceOpen, setEnrollSequenceOpen] = useState(false)
  const [contactListOpen, setContactListOpen] = useState(false)
  const [workMode, setWorkMode] = useState(false)
  const [batchPickerOpen, setBatchPickerOpen] = useState(false)
  const [workBatchSize, setWorkBatchSize] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const pendingProductId = useRef<number | null>(null)
  const pendingLeadType = useRef<"end_user" | "reseller">("end_user")
  const pendingTagIds = useRef<number[]>([])

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()) }

  // Debounce search
  const handleSearch = (v: string) => {
    setSearch(v)
    clearTimeout((handleSearch as unknown as { _t: ReturnType<typeof setTimeout> })._t)
    ;(handleSearch as unknown as { _t: ReturnType<typeof setTimeout> })._t = setTimeout(() => setDebouncedSearch(v), 300)
  }

  const { data: products = [] } = useListProducts()

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", statusFilter, debouncedSearch, productFilter, leadTypeFilter, tagFilterIds, tagMatch],
    queryFn: () => fetchLeads(statusFilter, debouncedSearch, productFilter, leadTypeFilter, tagFilterIds, tagMatch),
  })

  const selectedLeads = leads.filter(l => selectedIds.has(l.id))

  // Apollo CSV import — called after product + leadType are chosen
  const handleImportConfirm = (productId: number | null, leadType: "end_user" | "reseller", tagIds: number[]) => {
    pendingProductId.current = productId
    pendingLeadType.current = leadType
    pendingTagIds.current = tagIds
    fileRef.current?.click()
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportProgress(null)
    try {
      const text = await file.text()
      const result = await importApollo(text, pendingProductId.current, pendingLeadType.current, pendingTagIds.current, (processed, total) => {
        setImportProgress({ processed, total })
      })
      await qc.invalidateQueries({ queryKey: ["leads"] })
      const parts = [`Imported ${result.imported} lead${result.imported !== 1 ? "s" : ""}`]
      if (result.updated > 0) parts.push(`updated ${result.updated}`)
      toast({ title: parts.join(", ") + " from Apollo" })
    } catch {
      toast({ title: "Import failed", description: "Check your CSV format and try again.", variant: "destructive" })
    } finally {
      setImporting(false)
      setImportProgress(null)
      pendingProductId.current = null
      pendingLeadType.current = "end_user"
      pendingTagIds.current = []
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const workableCount = leads.filter(l => l.status === "new" || l.status === "contacted").length

  return (
    <>
      {workMode && <WorkMode leads={leads} onClose={() => { setWorkMode(false); setBatchPickerOpen(false) }} batchSize={workBatchSize} />}
      <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <LeadDetailDialog lead={selectedLead} onClose={() => setSelectedLead(null)} />
      <TemplatesManagerDialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <LinkedInTemplatesManagerDialog open={linkedinTemplatesOpen} onClose={() => setLinkedinTemplatesOpen(false)} />
      <EmailComposeDialog lead={emailLead} open={!!emailLead} onClose={() => setEmailLead(null)} />
      <BulkAssignDialog
        open={bulkAssignOpen}
        leadIds={[...selectedIds]}
        onClose={() => { setBulkAssignOpen(false); exitSelectMode() }}
      />
      <BulkTagDialog
        open={bulkTagsOpen}
        leadIds={[...selectedIds]}
        onClose={() => { setBulkTagsOpen(false); exitSelectMode() }}
      />
      <BulkScheduleDialog
        leads={selectedLeads}
        open={bulkScheduleOpen}
        onClose={() => setBulkScheduleOpen(false)}
        onScheduled={() => exitSelectMode()}
      />
      <ApolloImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onConfirm={handleImportConfirm}
      />
      <SequenceManagerDialog
        open={sequencesOpen}
        onClose={() => setSequencesOpen(false)}
        productId={productFilter !== "all" ? productFilter : null}
      />
      <EnrollInSequenceDialog
        leads={selectedLeads}
        open={enrollSequenceOpen}
        onClose={() => setEnrollSequenceOpen(false)}
        onEnrolled={() => exitSelectMode()}
        productId={productFilter !== "all" ? productFilter : null}
      />
      <CreateContactListDialog
        open={contactListOpen}
        onClose={() => setContactListOpen(false)}
        leadIds={[...selectedIds]}
        productId={productFilter !== "all" ? productFilter : null}
      />

      <div className="px-4 pt-5 pb-24 lg:pb-10 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">
                {view === "journal" ? "Email Journal" : "Leads"}
              </h1>
              {selectMode && selectedIds.size > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  {selectedIds.size} selected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {view === "leads"
                ? `${leads.length} lead${leads.length !== 1 ? "s" : ""}`
                : "All outbound email activity"}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* View toggle: Leads ↔ Journal */}
            <button
              onClick={() => { setView(v => v === "leads" ? "journal" : "leads"); exitSelectMode() }}
              className={cn(
                "p-2 rounded-lg transition-colors",
                view === "journal"
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={view === "journal" ? "Back to leads" : "Email journal"}
            >
              <BarChart2 className="w-4 h-4" />
            </button>

            {view === "leads" && (
              <>
                {/* Select mode toggle */}
                <button
                  onClick={() => { selectMode ? exitSelectMode() : setSelectMode(true) }}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    selectMode
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={selectMode ? "Cancel selection" : "Select leads"}
                >
                  <CheckSquare2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setLinkedinTemplatesOpen(true)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  title="LinkedIn Templates"
                >
                  <Linkedin className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTemplatesOpen(true)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  title="Email Templates"
                >
                  <FileText className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSequencesOpen(true)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  title="Email Sequences"
                >
                  <ArrowDownUp className="w-4 h-4" />
                </button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border/30 text-muted-foreground hover:text-foreground gap-1.5"
                  onClick={() => setImportDialogOpen(true)}
                  disabled={importing}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importing ? "Importing…" : "Apollo"}
                </Button>
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground gap-1.5"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Import progress bar ──────────────────────────────────────── */}
        {importing && (
          <div className="space-y-1.5 px-0.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {importProgress
                  ? `Importing ${importProgress.processed.toLocaleString()} / ${importProgress.total.toLocaleString()}…`
                  : "Preparing import…"}
              </span>
              {importProgress && (
                <span>{Math.round((importProgress.processed / importProgress.total) * 100)}%</span>
              )}
            </div>
            <Progress
              value={importProgress ? (importProgress.processed / importProgress.total) * 100 : 0}
              className="h-1.5"
            />
          </div>
        )}

        {/* ── Journal view ─────────────────────────────────────────────── */}
        {view === "journal" && <JournalView />}

        {/* ── Leads view ───────────────────────────────────────────────── */}
        {view === "leads" && (
          <>
            {/* Work mode CTA (hidden in select mode) */}
            {workableCount > 0 && !selectMode && !batchPickerOpen && (
              <button
                onClick={() => { setWorkBatchSize(null); setBatchPickerOpen(true) }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-all text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-primary">Start Working Leads</p>
                  <p className="text-xs text-primary/70">{workableCount} lead{workableCount !== 1 ? "s" : ""} to action · focused one-at-a-time mode</p>
                </div>
                <ChevronRight className="w-4 h-4 text-primary/50 shrink-0" />
              </button>
            )}

            {/* Batch size picker — expands in place of CTA */}
            {workableCount > 0 && !selectMode && batchPickerOpen && (() => {
              const PRESETS = [5, 10, 20].filter(n => n < workableCount)
              const effectiveBatch = workBatchSize ?? workableCount
              return (
                <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary">Start Working Leads</p>
                      <p className="text-xs text-primary/70 mt-0.5">How many leads in this session?</p>
                    </div>
                    <button
                      onClick={() => setBatchPickerOpen(false)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className={cn("grid gap-2", PRESETS.length > 0 ? "grid-cols-4" : "grid-cols-1")}>
                    {PRESETS.map(n => (
                      <button
                        key={n}
                        onClick={() => setWorkBatchSize(n)}
                        className={cn(
                          "py-2.5 rounded-xl border text-sm font-medium transition-all",
                          workBatchSize === n
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-primary/70 border-primary/30 hover:border-primary/60 hover:text-primary"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setWorkBatchSize(null)}
                      className={cn(
                        "py-2.5 rounded-xl border text-sm font-medium transition-all col-span-1",
                        workBatchSize === null
                          ? "bg-primary text-primary-foreground border-primary"
                          : "text-primary/70 border-primary/30 hover:border-primary/60 hover:text-primary"
                      )}
                    >
                      All {workableCount}
                    </button>
                  </div>

                  <Button
                    className="w-full bg-primary text-primary-foreground gap-2"
                    onClick={() => { setBatchPickerOpen(false); setWorkMode(true) }}
                  >
                    <Users className="w-4 h-4" />
                    Start {effectiveBatch === workableCount ? "all" : effectiveBatch} lead{effectiveBatch !== 1 ? "s" : ""} →
                  </Button>
                </div>
              )
            })()}

            {/* Select mode hint */}
            {selectMode && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/5 border border-primary/20">
                <CheckSquare2 className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-primary/80 flex-1">Tap leads to select, then assign or schedule.</p>
                <button
                  onClick={() => {
                    if (selectedIds.size === leads.length) {
                      setSelectedIds(new Set())
                    } else {
                      setSelectedIds(new Set(leads.map(l => l.id)))
                    }
                  }}
                  className="text-xs text-primary font-medium hover:text-primary/80 transition-colors shrink-0"
                >
                  {selectedIds.size === leads.length ? "Deselect all" : "Select all"}
                </button>
                <button onClick={exitSelectMode} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Search */}
            <Input
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search name, company, email…"
              className="bg-muted/40 border-border/30"
            />

            {/* Status filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 transition-all",
                    statusFilter === tab.key
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground border-border/30 hover:border-border"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Lead type filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
              {LEAD_TYPE_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setLeadTypeFilter(tab.key)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 transition-all",
                    leadTypeFilter === tab.key
                      ? "bg-violet-400/15 text-violet-400 border-violet-400/30"
                      : "text-muted-foreground border-border/30 hover:border-border"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Product filter — only shown when there are multiple products */}
            {products.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
                <button
                  onClick={() => setProductFilter("all")}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 transition-all",
                    productFilter === "all"
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "text-muted-foreground border-border/30 hover:border-border"
                  )}
                >
                  All products
                </button>
                {products.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setProductFilter(productFilter === p.id ? "all" : p.id)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 transition-all",
                      productFilter === p.id
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        : "text-muted-foreground border-border/30 hover:border-border"
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-border/30 bg-muted/15 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Tags className="w-3.5 h-3.5" /> Filter by tags</p>
                {tagFilterIds.length > 1 && (
                  <div className="flex rounded-lg border border-border/30 p-0.5">
                    {(["any", "all"] as const).map(match => (
                      <button key={match} onClick={() => setTagMatch(match)} className={cn("rounded-md px-2 py-1 text-[10px] font-medium capitalize", tagMatch === match ? "bg-primary/15 text-primary" : "text-muted-foreground")}>
                        {match}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <TagPicker value={tagFilterIds} onChange={setTagFilterIds} label={tagFilterIds.length > 1 ? `Match ${tagMatch}` : "Choose one or more tags"} allowCreate={false} />
            </div>

            {/* Lead list */}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No leads yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Add a lead manually or import from Apollo.io</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-border/30 gap-1.5" onClick={() => setImportDialogOpen(true)}>
                    <Upload className="w-3.5 h-3.5" /> Import Apollo CSV
                  </Button>
                  <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={() => setAddOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> Add Lead
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {leads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={() => !selectMode && setSelectedLead(lead)}
                    selectable={selectMode}
                    selected={selectedIds.has(lead.id)}
                    onToggle={() => toggleSelect(lead.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating action bar — shown when leads are selected */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+8px)] left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-card/95 border border-border/40 backdrop-blur-md shadow-xl">
            <div className="flex-1 px-2">
              <p className="text-sm font-medium text-foreground">
                {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selected
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-border/30 text-muted-foreground gap-1.5"
              onClick={exitSelectMode}
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-primary/40 text-primary gap-1.5"
              onClick={() => setBulkAssignOpen(true)}
            >
              <UserPlus className="w-3.5 h-3.5" /> Assign
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-primary/40 text-primary gap-1.5"
              onClick={() => setBulkTagsOpen(true)}
            >
              <Tags className="w-3.5 h-3.5" /> Tag
            </Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground gap-1.5"
              onClick={() => setBulkScheduleOpen(true)}
            >
              <Calendar className="w-3.5 h-3.5" /> Schedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-border/30 text-muted-foreground gap-1.5"
              onClick={() => setContactListOpen(true)}
            >
              <Users className="w-3.5 h-3.5" /> List
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-violet-400/40 text-violet-400 gap-1.5"
              onClick={() => setEnrollSequenceOpen(true)}
            >
              <ArrowDownUp className="w-3.5 h-3.5" /> Sequence
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
