import { useState } from "react"
import { useGoalsData, useGoalsMutations } from "@/hooks/use-goals"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Target, TrendingUp, Calendar, Zap, PoundSterling, BrainCircuit, Check, X, Loader2, Sparkles } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useListProducts, getListGoalsQueryKey } from "@workspace/api-client-react"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
]

const KIND_COLORS: Record<string, string> = {
  revenue:    "bg-ai/10 text-ai border-ai/20",
  activity:   "bg-success/10 text-success border-success/20",
  thirty_day: "bg-warn/10 text-warn border-warn/20",
}
const KIND_LABELS: Record<string, string> = {
  revenue: "Revenue", activity: "Activity", thirty_day: "30-Day Sprint"
}

export default function GoalsPage() {
  const { goals, numberSummary } = useGoalsData()
  const [generateOpen, setGenerateOpen] = useState(false)

  if (goals.isLoading || numberSummary.isLoading) {
    return <div className="p-4 space-y-4 animate-pulse">
      <div className="h-40 bg-muted rounded-2xl" />
      <div className="h-32 bg-muted rounded-2xl" />
    </div>
  }

  const numData = numberSummary.data
  const allGoals = goals.data || []

  const revenueGoals = allGoals.filter(g => g.kind === 'revenue')
  const activityGoals = allGoals.filter(g => g.kind === 'activity')
  const thirtyDay = allGoals.filter(g => g.kind === 'thirty_day')

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-8 px-4">
      {/* The Number */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-widest uppercase text-muted-foreground">The Number</h1>
          <Button
            size="sm"
            onClick={() => setGenerateOpen(true)}
            className="h-8 px-3 rounded-xl gap-1.5 bg-ai/10 text-ai border border-ai/20 hover:bg-ai/20"
            variant="ghost"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            Generate Goals
          </Button>
        </div>
        <Card className="bg-primary/5 border-primary/20 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <PoundSterling className="w-24 h-24 text-primary" />
          </div>
          <CardContent className="p-6 relative z-10">
            <div className="text-5xl font-bold tracking-tighter text-foreground mb-2">
              £{numData?.totalCurrent.toLocaleString("en-GB") ?? 0}
            </div>
            <div className="flex justify-between items-end mb-4">
              <span className="text-sm font-medium text-muted-foreground">
                of £{numData?.totalTarget.toLocaleString("en-GB") ?? 0} total goal
              </span>
              <span className="text-lg font-bold text-primary">{Math.round(numData?.pct ?? 0)}%</span>
            </div>
            <Progress value={numData?.pct} className="h-4 bg-background" indicatorColor="bg-primary" />
          </CardContent>
        </Card>
      </div>

      {/* 30-Day Sprints */}
      {thirtyDay.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-warn" />
            <h2 className="text-lg font-bold tracking-tight">30-Day Sprints</h2>
          </div>
          <div className="grid gap-3">
            {thirtyDay.map(g => <GoalCard key={g.id} goal={g} />)}
          </div>
        </div>
      )}

      {/* Activity Volume */}
      {activityGoals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-success" />
            <h2 className="text-lg font-bold tracking-tight">Daily Inputs</h2>
          </div>
          <div className="grid gap-3">
            {activityGoals.map(g => <GoalCard key={g.id} goal={g} />)}
          </div>
        </div>
      )}

      {/* Pipeline / Revenue */}
      {revenueGoals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-ai" />
            <h2 className="text-lg font-bold tracking-tight">Revenue Targets</h2>
          </div>
          <div className="grid gap-3">
            {revenueGoals.map(g => <GoalCard key={g.id} goal={g} />)}
          </div>
        </div>
      )}

      {allGoals.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
          <Target className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium mb-1">No goals yet</p>
          <p className="text-sm text-muted-foreground mb-4">Let AI generate realistic goals based on your team.</p>
          <Button onClick={() => setGenerateOpen(true)} className="gap-2">
            <BrainCircuit className="w-4 h-4" />
            Generate Goals
          </Button>
        </div>
      )}

      <GenerateGoalsDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </div>
  )
}

function GoalCard({ goal }: { goal: any }) {
  const pct = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100)) || 0

  const formatVal = (val: number) => {
    if (goal.unit === 'currency') return `£${val.toLocaleString("en-GB")}`
    if (goal.unit === 'percent') return `${val}%`
    return val.toLocaleString()
  }

  let indicatorClass = "bg-primary"
  if (goal.kind === 'activity') indicatorClass = "bg-success"
  if (goal.kind === 'thirty_day') indicatorClass = "bg-warn"
  if (goal.kind === 'revenue') indicatorClass = "bg-ai"

  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-4 mb-3">
          <div className="min-w-0">
            <h4 className="font-semibold text-foreground truncate">{goal.title}</h4>
            <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">{goal.metric}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="font-bold font-mono">{formatVal(goal.currentValue)}</span>
            <span className="text-muted-foreground text-xs ml-1">/ {formatVal(goal.targetValue)}</span>
          </div>
        </div>
        <Progress value={pct} className="h-2 bg-muted" indicatorColor={indicatorClass} />
      </CardContent>
    </Card>
  )
}

// ── Generate Goals Dialog ───────────────────────────────────────────────────
interface GeneratedGoal {
  productId: number
  kind: string
  title: string
  metric: string
  targetValue: number
  unit: string
  rationale?: string | null
  deadline?: string | null
}

function GenerateGoalsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: products = [] } = useListProducts()
  const now = new Date()
  const [productId, setProductId] = useState<string>("")
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [phase, setPhase] = useState<"form" | "loading" | "preview">("form")
  const [suggestions, setSuggestions] = useState<GeneratedGoal[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeProducts = products.filter((p: any) => p.status === "active" || p.status === "launching")

  const handleGenerate = async () => {
    if (!productId) { setError("Please select a product"); return }
    setError(null)
    setPhase("loading")
    try {
      const res = await fetch(`${BASE}/api/goals/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: parseInt(productId), month: parseInt(month), year: parseInt(year) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Generation failed")
      }
      const { goals } = await res.json()
      setSuggestions(goals)
      setSelected(new Set(goals.map((_: any, i: number) => i)))
      setPhase("preview")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setPhase("form")
    }
  }

  const handleSave = async () => {
    const toSave = suggestions.filter((_, i) => selected.has(i))
    if (toSave.length === 0) return
    setSaving(true)
    try {
      await fetch(`${BASE}/api/goals/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: toSave }),
      })
      await qc.invalidateQueries({ queryKey: getListGoalsQueryKey() })
      handleClose()
    } catch {
      setError("Failed to save goals")
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setPhase("form")
    setSuggestions([])
    setSelected(new Set())
    setError(null)
    onClose()
  }

  const toggleSelect = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const selectedProduct = activeProducts.find((p: any) => String(p.id) === productId)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-ai" />
            Generate Goals with AI
          </DialogTitle>
        </DialogHeader>

        {phase === "form" && (
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              AI will create realistic monthly goals based on your product, team, pipeline, and platform readiness.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Product</label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select a product…" />
                </SelectTrigger>
                <SelectContent>
                  {activeProducts.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Month</label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Year</label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[now.getFullYear(), now.getFullYear() + 1].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" onClick={handleClose} className="flex-1 h-11 rounded-xl">Cancel</Button>
              <Button onClick={handleGenerate} disabled={!productId} className="flex-1 h-11 rounded-xl gap-2">
                <BrainCircuit className="w-4 h-4" />
                Generate
              </Button>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <div className="py-12 flex flex-col items-center gap-4">
            <div className="relative">
              <Loader2 className="w-10 h-10 text-ai animate-spin" />
              <Sparkles className="w-4 h-4 text-primary absolute -top-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="font-semibold">Thinking about {selectedProduct?.name}…</p>
              <p className="text-sm text-muted-foreground mt-1">
                Analysing team capacity, pipeline, and platform readiness
              </p>
            </div>
          </div>
        )}

        {phase === "preview" && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selected.size} of {suggestions.length} goals selected
              </p>
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set(suggestions.map((_, i) => i)))}
                  className="text-xs text-primary hover:underline">All</button>
                <span className="text-muted-foreground text-xs">·</span>
                <button onClick={() => setSelected(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline">None</button>
              </div>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {suggestions.map((g, i) => (
                <button key={i} onClick={() => toggleSelect(i)} className="w-full text-left">
                  <div className={`rounded-2xl border p-3 transition-all ${
                    selected.has(i)
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card opacity-50"
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected.has(i) ? "border-primary bg-primary" : "border-border"
                      }`}>
                        {selected.has(i) && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={`text-[9px] px-1.5 h-4 border ${KIND_COLORS[g.kind] ?? ""}`}>
                            {KIND_LABELS[g.kind] ?? g.kind}
                          </Badge>
                          <span className="text-xs font-bold font-mono">
                            {g.unit === "currency"
                              ? `£${Math.round(g.targetValue).toLocaleString("en-GB")}`
                              : g.unit === "percent"
                              ? `${g.targetValue}%`
                              : g.targetValue.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm font-semibold leading-tight">{g.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{g.metric}</p>
                        {g.rationale && (
                          <p className="text-xs text-muted-foreground/70 mt-1 italic leading-tight">{g.rationale}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPhase("form")} className="h-11 rounded-xl px-4">
                Back
              </Button>
              <Button onClick={handleSave} disabled={selected.size === 0 || saving}
                className="flex-1 h-11 rounded-xl gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Add {selected.size} goal{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
