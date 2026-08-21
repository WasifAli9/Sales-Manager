import { useState, useRef } from "react"
import { useParams, Link } from "wouter"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useProductDetail } from "@/hooks/use-products"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import {
  Plus, Trash2, Download, Mail, Loader2,
  TrendingUp, CheckCircle2, AlertCircle, X, Pencil, Hash, DollarSign
} from "lucide-react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { motion, AnimatePresence } from "framer-motion"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const CURRENT_YEAR = new Date().getFullYear()

// ── types ──────────────────────────────────────────────────────────────────
interface RevenueLine {
  id: number
  productId: number
  name: string
  description: string | null
  unitValue: string   // numeric comes as string from server
  sortOrder: number
  createdAt: string
}

interface SalesTarget {
  id: number
  productId: number
  year: number
  month: number
  revenueLine: string
  targetAmount: string
  actualAmount: string | null
  revenueLineId: number | null
  unitVolume: string | null
}

// ── API helpers ────────────────────────────────────────────────────────────
async function fetchRevenueLines(productId: number): Promise<RevenueLine[]> {
  const res = await fetch(`${BASE}/api/revenue-lines?productId=${productId}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch revenue lines")
  return res.json()
}

async function fetchTargets(productId: number, year: number): Promise<SalesTarget[]> {
  const res = await fetch(`${BASE}/api/sales-targets?productId=${productId}&year=${year}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch targets")
  return res.json()
}

async function createRevenueLine(body: { productId: number; name: string; description?: string; unitValue?: number }): Promise<RevenueLine> {
  const res = await fetch(`${BASE}/api/revenue-lines`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!res.ok) { const d = await res.json() as {error?:string}; throw new Error(d.error ?? "Failed to create") }
  return res.json()
}

async function updateRevenueLine(id: number, body: { name?: string; description?: string | null; unitValue?: number }): Promise<RevenueLine> {
  const res = await fetch(`${BASE}/api/revenue-lines/${id}`, {
    method: "PATCH", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!res.ok) { const d = await res.json() as {error?:string}; throw new Error(d.error ?? "Failed to update") }
  return res.json()
}

async function deleteRevenueLine(id: number): Promise<void> {
  await fetch(`${BASE}/api/revenue-lines/${id}`, { method: "DELETE", credentials: "include" })
}

async function upsertVolume(body: {
  revenueLineId: number; year: number; month: number; unitVolume: number
}): Promise<SalesTarget> {
  const res = await fetch(`${BASE}/api/sales-targets`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error("Failed to save volume")
  return res.json()
}

// ── VolumeCell ─────────────────────────────────────────────────────────────
function VolumeCell({
  volume, revenue, unitValue, canEdit, onSave
}: {
  volume: number | null
  revenue: number
  unitValue: number
  canEdit: boolean
  onSave: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(volume != null ? String(volume) : "")
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const n = parseFloat(local.replace(/[^0-9.]/g, "")) || 0
    onSave(n)
    setEditing(false)
    setLocal(n > 0 ? String(n) : "")
  }

  if (editing) {
    const preview = (parseFloat(local.replace(/[^0-9.]/g, "")) || 0) * unitValue
    return (
      <div className="flex flex-col gap-0.5">
        <input
          ref={inputRef}
          autoFocus
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false) }}
          className="w-full text-right text-xs font-mono bg-transparent border-b border-primary/40 outline-none px-1 py-0.5 text-primary"
          placeholder="0"
        />
        {unitValue > 0 && (
          <p className="text-[9px] text-right text-muted-foreground/60 px-1">
            £{preview.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
          </p>
        )}
      </div>
    )
  }

  const hasVolume = volume != null && volume > 0

  return (
    <button
      onClick={() => {
        if (!canEdit) return
        setEditing(true)
        setLocal(volume != null && volume > 0 ? String(volume) : "")
        setTimeout(() => inputRef.current?.select(), 10)
      }}
      disabled={!canEdit}
      className={`w-full flex flex-col items-end px-1 py-0.5 rounded transition-colors
        ${canEdit ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"}`}
    >
      {/* Volume */}
      <span className={`text-xs font-mono ${hasVolume ? "text-foreground" : "text-muted-foreground/25"}`}>
        {hasVolume ? volume!.toLocaleString("en-GB") : "—"}
      </span>
      {/* Computed revenue */}
      {hasVolume && unitValue > 0 && (
        <span className="text-[9px] text-muted-foreground/50 leading-none">
          £{revenue.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
        </span>
      )}
    </button>
  )
}

// ── Revenue line label (editable by owner) ─────────────────────────────────
function RevenueLineLabel({
  line, canEdit, onSaved, onDelete, isDeleting
}: {
  line: RevenueLine
  canEdit: boolean
  onSaved: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(line.name)
  const [description, setDescription] = useState(line.description ?? "")
  const [unitValue, setUnitValue] = useState(parseFloat(line.unitValue as string) || 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true); setError("")
    try {
      await updateRevenueLine(line.id, {
        name: name.trim(),
        description: description.trim() || null,
        unitValue,
      })
      onSaved()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const unitValueNum = parseFloat(line.unitValue as string) || 0

  return (
    <div className="w-44 shrink-0 flex items-start gap-1 px-2 py-1.5 min-h-[40px]">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate leading-tight">{line.name}</p>
        {line.description && (
          <p className="text-[10px] text-muted-foreground/60 truncate leading-tight mt-0.5">{line.description}</p>
        )}
        {unitValueNum > 0 && (
          <p className="text-[9px] text-primary/60 leading-tight mt-0.5">
            £{unitValueNum.toLocaleString("en-GB", { maximumFractionDigits: 2 })}/unit
          </p>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded">
                <Pencil className="w-3 h-3" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Revenue Line</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Name *</label>
                  <Input value={name} onChange={e => setName(e.target.value)} className="h-10 rounded-xl" placeholder="e.g. SaaS Subscriptions" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <Input value={description} onChange={e => setDescription(e.target.value)} className="h-10 rounded-xl" placeholder="Optional — shown under the name" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Unit value (£)</label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={unitValue}
                    onChange={e => setUnitValue(parseFloat(e.target.value) || 0)}
                    className="h-10 rounded-xl"
                    placeholder="e.g. 1000"
                  />
                  <p className="text-[10px] text-muted-foreground">Revenue per cell = unit value × volume you enter each month</p>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-xl px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
                  </div>
                )}
                <Button onClick={handleSave} disabled={!name.trim() || saving} className="w-full h-10 rounded-xl gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-destructive rounded"
          >
            {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add Revenue Line dialog ────────────────────────────────────────────────
function AddRevenueLineDialog({
  productId, onAdded
}: { productId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [unitValue, setUnitValue] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true); setError("")
    try {
      await createRevenueLine({ productId, name: name.trim(), description: description.trim() || undefined, unitValue })
      onAdded()
      setName(""); setDescription(""); setUnitValue(0)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full h-10 rounded-xl gap-2 border-dashed text-sm">
          <Plus className="w-4 h-4" />
          Add revenue line
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Revenue Line</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
              placeholder="e.g. SaaS Subscriptions"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description <span className="text-muted-foreground/50">(optional)</span></label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Shown below the name in the grid"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Unit value (£) <span className="text-muted-foreground/50">(optional)</span></label>
            <Input
              type="number" min="0" step="0.01"
              value={unitValue || ""}
              onChange={e => setUnitValue(parseFloat(e.target.value) || 0)}
              placeholder="e.g. 1000 — price per unit/seat/deal"
              className="h-10 rounded-xl"
            />
            <p className="text-[10px] text-muted-foreground">Revenue = unit value × monthly volume. You can update this later.</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-xl px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
            </div>
          )}
          <Button onClick={handleAdd} disabled={!name.trim() || saving} className="w-full h-10 rounded-xl gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Revenue Line
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Email dialog ───────────────────────────────────────────────────────────
function EmailDialog({ productId, year }: { productId: number; year: number }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(user?.email ?? "")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    setSending(true); setError(null)
    try {
      const res = await fetch(`${BASE}/api/sales-targets/email`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, year, recipientEmail: email })
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? "Failed to send")
      }
      setSent(true)
      setTimeout(() => { setOpen(false); setSent(false) }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setSent(false); setError(null) } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9 rounded-xl text-xs">
          <Mail className="w-3.5 h-3.5" />
          Email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Email as Excel</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
              <p className="font-semibold">Sent!</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Recipient email</label>
                <Input value={email} onChange={e => setEmail(e.target.value)} type="email" className="h-11 rounded-xl" />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <Button onClick={handleSend} disabled={sending || !email} className="w-full h-11 rounded-xl gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sending ? "Sending…" : "Send Excel"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function TargetsPage() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [deletingLineId, setDeletingLineId] = useState<number | null>(null)
  const [showActuals, setShowActuals] = useState(false)

  const { user } = useAuth()
  const isOwner = user?.role === "owner"
  const canEditVolumes = user?.role === "owner" || user?.role === "admin"

  const qc = useQueryClient()
  const { data: product } = useProductDetail(productId)

  const rlKey = ["revenue-lines", productId]
  const tKey  = ["sales-targets", productId, year]

  const rlQuery = useQuery({ queryKey: rlKey, queryFn: () => fetchRevenueLines(productId), enabled: !!productId })
  const tQuery  = useQuery({ queryKey: tKey,  queryFn: () => fetchTargets(productId, year), enabled: !!productId })

  const upsertMut = useMutation({
    mutationFn: upsertVolume,
    onSuccess: () => qc.invalidateQueries({ queryKey: tKey }),
  })

  const revenueLines = rlQuery.data ?? []
  const targets = tQuery.data ?? []

  // Find a monthly entry for a given revenue line + month
  const getEntry = (rlId: number, month: number): SalesTarget | undefined =>
    targets.find(t => t.revenueLineId === rlId && t.month === month)

  const getVolume = (rlId: number, month: number): number | null => {
    const e = getEntry(rlId, month)
    if (!e || e.unitVolume == null) return null
    const v = parseFloat(e.unitVolume as string)
    return isNaN(v) ? null : v
  }

  const getRevenue = (rlId: number, month: number, unitValue: number): number => {
    const vol = getVolume(rlId, month)
    if (vol == null) return 0
    return vol * unitValue
  }

  const handleDeleteLine = async (line: RevenueLine) => {
    if (!confirm(`Delete "${line.name}" and all its monthly data across all years? This cannot be undone.`)) return
    setDeletingLineId(line.id)
    await deleteRevenueLine(line.id)
    qc.invalidateQueries({ queryKey: rlKey })
    qc.invalidateQueries({ queryKey: tKey })
    setDeletingLineId(null)
  }

  // Monthly column totals (sum of computed revenues)
  const monthRevTotals = MONTHS.map((_, i) =>
    revenueLines.reduce((s, rl) => {
      const uv = parseFloat(rl.unitValue as string) || 0
      return s + getRevenue(rl.id, i + 1, uv)
    }, 0)
  )

  // Actuals (from legacy targetAmount / actualAmount where applicable)
  const actualTotals = MONTHS.map((_, i) =>
    revenueLines.reduce((s, rl) => {
      const e = getEntry(rl.id, i + 1)
      return s + (e?.actualAmount != null ? parseFloat(e.actualAmount as string) || 0 : 0)
    }, 0)
  )

  const annualTarget = monthRevTotals.reduce((a, b) => a + b, 0)
  const annualActual = actualTotals.reduce((a, b) => a + b, 0)

  const handleExport = () => {
    window.open(`${BASE}/api/sales-targets/export?productId=${productId}&year=${year}`, "_blank")
  }

  if (rlQuery.isLoading || tQuery.isLoading) {
    return (
      <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 px-4 space-y-4 animate-pulse">
        <div className="h-10 w-32 bg-muted rounded" />
        <div className="h-64 bg-muted rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 min-h-0">
      {/* Header */}
      <div className="px-4 shrink-0">
        <Breadcrumbs
          items={[
            { label: "Portfolio", href: "/products" },
            { label: product?.name ?? "Product", href: `/products/${productId}` },
            { label: "Sales Targets" },
          ]}
        />
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sales Targets</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {canEditVolumes ? "Tap any cell to edit volume · Revenue = unit value × volume" : "Read-only view"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <EmailDialog productId={productId} year={year} />
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-9 rounded-xl text-xs">
              <Download className="w-3.5 h-3.5" />
              Excel
            </Button>
          </div>
        </div>

        {/* Year selector + Actuals toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2].map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all
                  ${y === year ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {y}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowActuals(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors
              ${showActuals ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            {showActuals ? "Actuals on" : "Show actuals"}
          </button>
        </div>

        {/* Annual summary cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 flex items-center gap-3">
              <span className="text-lg text-primary shrink-0 font-bold">£</span>
              <div>
                <p className="text-xs text-muted-foreground">Annual Target</p>
                <p className="text-lg font-bold text-primary">
                  £{annualTarget.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="p-3 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Actual YTD</p>
                <p className="text-lg font-bold text-green-400">
                  £{annualActual.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto px-2 min-h-0">
        <div className="min-w-max pb-4">
          {/* Column header row */}
          <div className="flex sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
            {/* Revenue line column */}
            <div className="w-44 shrink-0 px-3 py-2.5">
              <div className="flex items-center gap-1">
                <Hash className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Revenue Line</span>
              </div>
              <div className="text-[9px] text-muted-foreground/50 mt-0.5 flex gap-2">
                <span className="flex items-center gap-0.5"><DollarSign className="w-2 h-2" />unit price</span>
              </div>
            </div>
            {MONTHS.map(m => (
              <div key={m} className="w-20 shrink-0 text-center py-2.5">
                <span className="text-xs font-bold text-muted-foreground">{m}</span>
                <div className="text-[9px] text-muted-foreground/40 mt-0.5">vol / £</div>
              </div>
            ))}
            <div className="w-24 shrink-0 text-center py-2.5">
              <span className="text-xs font-bold text-primary">Total</span>
            </div>
          </div>

          {/* Revenue line rows */}
          <AnimatePresence>
            {revenueLines.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2"
              >
                <p>No revenue lines yet.</p>
                {isOwner && <p className="text-xs text-muted-foreground/60">Add one below to get started.</p>}
              </motion.div>
            )}
            {revenueLines.map((rl, li) => {
              const unitValue = parseFloat(rl.unitValue as string) || 0
              const rowTotal = MONTHS.reduce((s, _, i) => s + getRevenue(rl.id, i + 1, unitValue), 0)
              const rowActual = MONTHS.reduce((s, _, i) => {
                const e = getEntry(rl.id, i + 1)
                return s + (e?.actualAmount != null ? parseFloat(e.actualAmount as string) || 0 : 0)
              }, 0)

              return (
                <motion.div
                  key={rl.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`flex items-center border-b border-border/50 group ${li % 2 === 0 ? "bg-card/50" : "bg-background"}`}
                >
                  {/* Line label */}
                  <RevenueLineLabel
                    line={rl}
                    canEdit={isOwner}
                    onSaved={() => qc.invalidateQueries({ queryKey: rlKey })}
                    onDelete={() => handleDeleteLine(rl)}
                    isDeleting={deletingLineId === rl.id}
                  />

                  {/* Month cells */}
                  {MONTHS.map((_, mi) => {
                    const vol = getVolume(rl.id, mi + 1)
                    const rev = getRevenue(rl.id, mi + 1, unitValue)
                    return (
                      <div key={mi} className="w-20 shrink-0 px-1 py-0.5 space-y-0.5">
                        <VolumeCell
                          volume={vol}
                          revenue={rev}
                          unitValue={unitValue}
                          canEdit={canEditVolumes}
                          onSave={v => upsertMut.mutate({ revenueLineId: rl.id, year, month: mi + 1, unitVolume: v })}
                        />
                        {showActuals && (() => {
                          const e = getEntry(rl.id, mi + 1)
                          const actual = e?.actualAmount != null ? parseFloat(e.actualAmount as string) || 0 : 0
                          return (
                            <p className={`text-right text-[10px] font-mono px-1 ${actual > 0 ? "text-green-400" : "text-muted-foreground/25"}`}>
                              {actual > 0 ? `£${actual.toLocaleString("en-GB", { maximumFractionDigits: 0 })}` : "—"}
                            </p>
                          )
                        })()}
                      </div>
                    )
                  })}

                  {/* Row total */}
                  <div className="w-24 shrink-0 px-2 py-1 text-right space-y-0.5">
                    <p className="text-xs font-bold text-primary">
                      £{rowTotal.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                    </p>
                    {showActuals && rowActual > 0 && (
                      <p className="text-xs font-semibold text-green-400">
                        £{rowActual.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Monthly totals row */}
          {revenueLines.length > 0 && (
            <div className="flex items-center border-t-2 border-primary/30 bg-primary/5 sticky bottom-0">
              <div className="w-44 shrink-0 px-3 py-2.5 text-xs font-bold text-primary uppercase tracking-wider">
                Total Revenue
              </div>
              {MONTHS.map((_, i) => (
                <div key={i} className="w-20 shrink-0 px-1 py-2 space-y-0.5">
                  <p className="text-xs font-bold text-right text-primary">
                    {monthRevTotals[i] > 0 ? `£${monthRevTotals[i].toLocaleString("en-GB", { maximumFractionDigits: 0 })}` : "—"}
                  </p>
                  {showActuals && (
                    <p className="text-xs font-semibold text-right text-green-400/70">
                      {actualTotals[i] > 0 ? `£${actualTotals[i].toLocaleString("en-GB", { maximumFractionDigits: 0 })}` : "—"}
                    </p>
                  )}
                </div>
              ))}
              <div className="w-24 shrink-0 px-2 py-2 text-right">
                <p className="text-xs font-bold text-primary">
                  £{annualTarget.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                </p>
                {showActuals && (
                  <p className="text-xs font-semibold text-green-400">
                    £{annualActual.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add revenue line — owner only */}
      {isOwner && (
        <div className="px-4 pt-3 shrink-0 border-t border-border">
          <AddRevenueLineDialog productId={productId} onAdded={() => qc.invalidateQueries({ queryKey: rlKey })} />
        </div>
      )}
    </div>
  )
}
