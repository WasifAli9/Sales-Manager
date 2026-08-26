import { useQueryClient, useQuery } from "@tanstack/react-query"
import { useTodayData, useTodayMutations } from "@/hooks/use-today"
import { useDueReviews } from "@/hooks/use-pipeline-reviews"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Circle, BrainCircuit, Flag, AlertTriangle, Moon, Plus, Activity as ActivityIcon, Bell, ChevronRight, CalendarClock, Dumbbell, Flame, Pencil } from "lucide-react"
import { CourageBar } from "@/components/courage-bar"
import { format } from "date-fns"
import { ActivityStatus, ActivityCategory, Activity, TodaySummary } from "@workspace/api-client-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { addActivitySchema, AddActivityForm } from "@/lib/schemas"
import { Textarea } from "@/components/ui/textarea"
import { useState, Component, type ReactNode, useEffect, useRef } from "react"
import { getTodayStr } from "@/lib/date"
import { HealthVisionFlash } from "@/components/health-vision-flash"

/** Silent boundary — if CourageBar throws for any reason, just hide it. */
class CourageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

export default function TodayPage() {
  const { summary, activities } = useTodayData()
  const { updateActivity, generateActivities } = useTodayMutations()
  const { dueReviews } = useDueReviews()
  const [isGenerating, setIsGenerating] = useState(false)
  const [flashOpen, setFlashOpen] = useState(false)

  if (summary.isLoading || activities.isLoading) {
    return (
      <div className="flex-1 p-4 space-y-6 animate-pulse">
        <div className="h-20 bg-muted rounded-2xl" />
        <div className="h-32 bg-muted rounded-2xl" />
        <div className="h-64 bg-muted rounded-2xl" />
      </div>
    )
  }

  const sumData = summary.data
  const acts = activities.data || []

  // Courage bar: track completed SELL/CX outreach actions today
  const sellActs = acts.filter(a =>
    ['SELL', 'CX'].includes(a.category) && a.status === ActivityStatus.done
  )
  const hasSellActivity = sellActs.length > 0

  const handleToggleAct = (act: Activity) => {
    updateActivity.mutate({
      id: act.id,
      data: { status: act.status === ActivityStatus.done ? ActivityStatus.pending : ActivityStatus.done }
    })
  }

  const handleGenerate = () => {
    setIsGenerating(true)
    generateActivities.mutate({ data: { date: getTodayStr() } }, {
      onSettled: () => setIsGenerating(false)
    })
  }

  const handleDelegateDefer = (id: number, action: ActivityStatus) => {
    updateActivity.mutate({
      id,
      data: { status: action }
    })
  }

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-6 px-4">
      <HealthVisionFlash forceOpen={flashOpen} onClose={() => setFlashOpen(false)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
            {format(new Date(), "EEEE, MMM d")}
          </h1>
          {sumData?.coachPush && (
            <p className="text-sm font-medium text-muted-foreground mt-1">
              "{sumData.coachPush}"
            </p>
          )}
        </div>
        <button
          onClick={() => setFlashOpen(true)}
          title="Daily health reminder & vision board"
          className="shrink-0 mt-1 flex items-center gap-1.5 bg-success/10 hover:bg-success/20 text-success rounded-xl px-3 py-2 text-xs font-bold transition-colors"
        >
          <ActivityIcon className="w-3.5 h-3.5" />
          Health
        </button>
      </div>

      {/* Courage Bar — isolated boundary so a crash here never kills Today */}
      <CourageBoundary>
        <CourageBar
          hasSellActivity={hasSellActivity}
          sellActivityCount={sellActs.length}
          onNavigateToPipeline={undefined}
        />
      </CourageBoundary>

      {/* Focus Guard */}
      {sumData?.focusGuard && (
        <Card className="border-0 bg-popover shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-foreground">Focus Guard</span>
              <span className="text-xs font-mono font-medium tracking-tighter text-muted-foreground">
                90/10 TARGET
              </span>
            </div>
            <div className="space-y-1">
              <Progress 
                value={sumData.focusGuard.sellCxPct} 
                className="h-3 bg-muted" 
                indicatorColor={sumData.focusGuard.sellCxPct >= 90 ? "bg-success" : sumData.focusGuard.sellCxPct >= 50 ? "bg-warn" : "bg-destructive"}
              />
              <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                <span>{sumData.focusGuard.sellCxMinutes}m SELL/CX</span>
                <span>{sumData.focusGuard.buildAdminMinutes}m BUILD/ADMIN</span>
              </div>
            </div>
            {sumData.focusGuard.status !== "on_track" && (
              <div className="flex items-start gap-2 bg-warn/10 text-warn-foreground p-3 rounded-xl">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warn" />
                <p className="text-xs font-medium leading-relaxed">
                  This is a tweak, not a sale. Delegate, defer, or delete it.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pace Alerts */}
      {sumData?.paceAlerts && sumData.paceAlerts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory hide-scrollbar">
          {sumData.paceAlerts.map(alert => (
            <div key={alert.goalId} className="snap-center shrink-0 w-[240px] bg-card border border-border rounded-xl p-3 flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase truncate">{alert.title}</span>
              <span className="text-sm font-medium text-foreground">Need <span className="text-primary">{alert.requiredDailyPace}</span>/day</span>
            </div>
          ))}
          <div className="w-1 shrink-0" aria-hidden="true" />
        </div>
      )}

      {/* Actions Row */}
      <div className="flex gap-2">
        <AddActivityDialog />
        <Button 
          variant="ai" 
          className="flex-1 gap-2 rounded-2xl shadow-sm min-h-[44px]"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <div className="w-4 h-4 rounded-full border-2 border-ai-foreground border-t-transparent animate-spin" />
          ) : (
            <BrainCircuit className="w-4 h-4" />
          )}
          {isGenerating ? "Planning..." : "Generate Plan"}
        </Button>
      </div>

      {/* Reviews Due */}
      {dueReviews.data && dueReviews.data.length > 0 && (
        <ReviewsDueSection reviews={dueReviews.data} />
      )}

      {/* Activities List */}
      <div className="space-y-4">
        {acts.length === 0 ? (
          <div className="text-center py-10 bg-card rounded-2xl border border-dashed border-border">
            <Flag className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm">No activities yet. Build the plan.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {acts.filter(a => ['pending','done'].includes(a.status)).map(act => {
              const isDone = act.status === ActivityStatus.done;
              const isDistraction = ['BUILD','ADMIN'].includes(act.category) && sumData?.focusGuard?.status !== "on_track";
              return (
                <div key={act.id} className="group flex flex-col gap-2 bg-card rounded-2xl p-3 shadow-sm border border-border">
                  <div className="flex items-start gap-3">
                    <button 
                      onClick={() => handleToggleAct(act)}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 -mt-2 rounded-full"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-6 h-6 text-success" />
                      ) : (
                        <Circle className="w-6 h-6 text-border group-hover:text-primary" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className={`text-sm font-medium leading-tight break-words ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {act.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant={act.category.toLowerCase() as any} className="text-[9px] uppercase px-1.5 py-0 h-5">
                          {act.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">{act.effortMinutes}m</span>
                        {act.platform && (
                          <span className="text-xs text-muted-foreground capitalize">{act.platform}</span>
                        )}
                      </div>
                    </div>
                    <EditActivityDialog activity={act} />
                  </div>
                  {isDistraction && !isDone && (
                    <div className="flex gap-2 ml-[44px] mt-1">
                      <Button size="sm" variant="outline" className="min-h-[32px] text-xs border-dashed" onClick={() => handleDelegateDefer(act.id, ActivityStatus.delegated)}>Delegate</Button>
                      <Button size="sm" variant="outline" className="min-h-[32px] text-xs border-dashed" onClick={() => handleDelegateDefer(act.id, ActivityStatus.deferred)}>Defer</Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 7-day health tracker */}
      <div className="mx-4 mb-2">
        <SevenDayHealthTracker />
      </div>

      <DailyReflection />
    </div>
  )
}

// ── Reviews Due Section ────────────────────────────────────────────────────
import { Link } from "wouter"
import { useMarkReviewed, type DueReview } from "@/hooks/use-pipeline-reviews"

function ReviewsDueSection({ reviews }: { reviews: DueReview[] }) {
  const { markReviewed } = useMarkReviewed()
  const [snoozing, setSnoozing] = useState<number | null>(null)
  const today = getTodayStr()

  const isOverdue = (dateStr: string) => dateStr < today

  const snooze = async (id: number, days: number) => {
    setSnoozing(id)
    const d = new Date(); d.setDate(d.getDate() + days)
    await markReviewed(id, d.toISOString().slice(0, 10))
    setSnoozing(null)
  }

  const dismiss = async (id: number) => {
    setSnoozing(id)
    await markReviewed(id, null)
    setSnoozing(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
          Reviews Due ({reviews.length})
        </h2>
      </div>
      <div className="space-y-2">
        {reviews.map(r => {
          const overdue = isOverdue(r.nextReviewDate)
          const loading = snoozing === r.id
          return (
            <div key={r.id} className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-start gap-3">
                <CalendarClock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{r.contactName}</p>
                    {r.companyName && <span className="text-xs text-muted-foreground">· {r.companyName}</span>}
                    {overdue && (
                      <Badge className="text-[9px] px-1.5 h-4 bg-red-500/20 text-red-400 border-red-500/30 border">Overdue</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{r.productName}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      Due {format(new Date(r.nextReviewDate + "T00:00:00"), "d MMM")}
                    </span>
                  </div>
                </div>
                <Link href={`/pipeline/${r.productId}`}>
                  <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-amber-400 transition-colors" />
                </Link>
              </div>
              <div className="flex gap-2 flex-wrap pl-7">
                <Button size="sm" variant="outline"
                  className="h-7 text-xs rounded-xl border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  disabled={loading} onClick={() => snooze(r.id, 7)}>
                  {loading ? <div className="w-3 h-3 rounded-full border border-amber-400 border-t-transparent animate-spin" /> : "Snooze 7d"}
                </Button>
                <Button size="sm" variant="outline"
                  className="h-7 text-xs rounded-xl border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  disabled={loading} onClick={() => snooze(r.id, 30)}>
                  Snooze 30d
                </Button>
                <Button size="sm" variant="ghost"
                  className="h-7 text-xs rounded-xl text-muted-foreground"
                  disabled={loading} onClick={() => dismiss(r.id)}>
                  Done
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AddActivityDialog() {
  const { createActivity } = useTodayMutations()
  const [open, setOpen] = useState(false)
  const form = useForm<AddActivityForm>({
    resolver: zodResolver(addActivitySchema),
    defaultValues: { title: "", effortMinutes: 30, category: ActivityCategory.SELL }
  })

  const category = form.watch("category")
  const needsDelegationCheck = ['BUILD', 'ADMIN'].includes(category)

  const onSubmit = (data: AddActivityForm) => {
    createActivity.mutate({
      data: {
        ...data,
        date: getTodayStr(),
      }
    }, {
      onSuccess: () => {
        setOpen(false)
        form.reset()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="flex-1 gap-2 shadow-sm min-h-[44px]">
          <Plus className="w-4 h-4" />
          Add Action
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Activity</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ActivityFormFields form={form} needsDelegationCheck={needsDelegationCheck} />
            <Button type="submit" className="w-full mt-4 min-h-[44px]" disabled={createActivity.isPending}>
              {createActivity.isPending ? "Adding..." : "Add to Today"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function EditActivityDialog({ activity }: { activity: Activity }) {
  const { updateActivity } = useTodayMutations()
  const [open, setOpen] = useState(false)
  const form = useForm<AddActivityForm>({
    resolver: zodResolver(addActivitySchema),
    defaultValues: {
      title: activity.title,
      effortMinutes: activity.effortMinutes,
      category: activity.category,
      delegateTo: activity.delegateTo ?? "",
    },
  })

  const category = form.watch("category")
  const needsDelegationCheck = ['BUILD', 'ADMIN'].includes(category)

  useEffect(() => {
    if (!open) return
    form.reset({
      title: activity.title,
      effortMinutes: activity.effortMinutes,
      category: activity.category,
      delegateTo: activity.delegateTo ?? "",
    })
  }, [open, activity, form])

  const onSubmit = (data: AddActivityForm) => {
    updateActivity.mutate({
      id: activity.id,
      data: {
        title: data.title,
        category: data.category,
        effortMinutes: data.effortMinutes,
        delegateTo: data.delegateTo || null,
      },
    }, {
      onSuccess: () => setOpen(false),
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Edit action"
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full hover:bg-muted/50"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Action</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ActivityFormFields form={form} needsDelegationCheck={needsDelegationCheck} />
            <Button type="submit" className="w-full mt-4 min-h-[44px]" disabled={updateActivity.isPending}>
              {updateActivity.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function ActivityFormFields({
  form,
  needsDelegationCheck,
}: {
  form: ReturnType<typeof useForm<AddActivityForm>>
  needsDelegationCheck: boolean
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Action</FormLabel>
            <FormControl>
              <Input placeholder="What needs doing?" {...field} autoFocus />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="SELL">SELL</SelectItem>
                  <SelectItem value="CX">CX</SelectItem>
                  <SelectItem value="BUILD">BUILD</SelectItem>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="effortMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Minutes</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      {needsDelegationCheck && (
        <FormField
          control={form.control}
          name="delegateTo"
          render={({ field }) => (
            <FormItem className="bg-warn/10 p-4 rounded-xl border border-warn/20 mt-4">
              <FormLabel className="text-warn-foreground">Who can own this instead of you?</FormLabel>
              <FormControl>
                <Input placeholder="Name or leave blank if you MUST do it" {...field} className="bg-background" />
              </FormControl>
              <p className="text-xs text-warn-foreground/80 mt-1">
                Build/Admin tasks kill sales momentum. Just saying.
              </p>
            </FormItem>
          )}
        />
      )}
    </>
  )
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

interface OutreachProductRow {
  productId: number | null
  productName: string | null
  emailsSent: number
  linkedinActions: number
}
interface OutreachSummary {
  date: string
  byProduct: OutreachProductRow[]
  totals: { emailsSent: number; linkedinActions: number }
}

async function fetchOutreachToday(date: string): Promise<OutreachSummary> {
  const res = await fetch(`${BASE_URL}/api/outreach/today?date=${date}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch outreach summary")
  return res.json()
}

function OutreachSummaryCard({ date }: { date: string }) {
  const { data, isLoading } = useQuery<OutreachSummary>({
    queryKey: ["outreach-today", date],
    queryFn: () => fetchOutreachToday(date),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 animate-pulse">
        <div className="h-3 w-28 bg-muted rounded mb-2" />
        <div className="h-3 w-full bg-muted rounded" />
      </div>
    )
  }

  const totals = data?.totals ?? { emailsSent: 0, linkedinActions: 0 }
  const hasAny = totals.emailsSent > 0 || totals.linkedinActions > 0

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">Today's Outreach</p>
      {hasAny ? (
        <div className="space-y-1">
          {data!.byProduct.map((row, i) => {
            const label = row.productName ?? "No product"
            const parts: string[] = []
            if (row.emailsSent > 0) parts.push(`${row.emailsSent} email${row.emailsSent !== 1 ? "s" : ""}`)
            if (row.linkedinActions > 0) parts.push(`${row.linkedinActions} LinkedIn`)
            return (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground truncate">{label}</span>
                <span className="text-xs font-medium text-foreground shrink-0">{parts.join(" · ")}</span>
              </div>
            )
          })}
          <div className="pt-1 border-t border-primary/10 flex items-center justify-between gap-3">
            <span className="text-[10px] text-primary/60 font-medium uppercase tracking-wide">Total</span>
            <span className="text-xs font-semibold text-primary">
              {[
                totals.emailsSent > 0 && `${totals.emailsSent} email${totals.emailsSent !== 1 ? "s" : ""}`,
                totals.linkedinActions > 0 && `${totals.linkedinActions} LinkedIn`,
              ].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No emails sent or LinkedIn actions recorded today.</p>
      )}
    </div>
  )
}

// ── 7-Day Health Tracker ───────────────────────────────────────────────────
interface ReflectionRow {
  id: number
  date: string
  exercise: string | null
  energy: number
  coachFeedback: string | null
}

function SevenDayHealthTracker() {
  const queryClient = useQueryClient()
  const { data: reflections = [], isLoading } = useQuery<ReflectionRow[]>({
    queryKey: ["reflections-week"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/reflections`, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to fetch")
      return res.json()
    },
    staleTime: 60_000,
  })

  // Build last 7 days as date strings
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().slice(0, 10)
  })

  const byDate = new Map(reflections.map(r => [r.date, r]))

  // Log dialog state
  const [logDate, setLogDate] = useState<string | null>(null)
  const logRow = logDate ? byDate.get(logDate) ?? null : null
  const [exercise, setExercise] = useState("")
  const [energy, setEnergy] = useState(3)
  const [saving, setSaving] = useState(false)

  const openLog = (dateStr: string) => {
    const row = byDate.get(dateStr)
    setExercise(row?.exercise ?? "")
    setEnergy(row?.energy ?? 3)
    setLogDate(dateStr)
  }

  const handleSave = async () => {
    if (!logDate) return
    setSaving(true)
    try {
      await fetch(`${BASE_URL}/api/reflections/${logDate}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ exercise: exercise.trim() || null, energy }),
      })
      await queryClient.invalidateQueries({ queryKey: ["reflections-week"] })
      setLogDate(null)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex gap-1.5 animate-pulse">
        {days.map(d => (
          <div key={d} className="flex-1 h-16 bg-muted rounded-xl" />
        ))}
      </div>
    )
  }

  const logDayLabel = logDate
    ? new Date(logDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", month: "short", day: "numeric" })
    : ""

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Dumbbell className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">7-Day Health</p>
        </div>
        <div className="flex gap-1.5">
          {days.map(dateStr => {
            const row = byDate.get(dateStr)
            const dayLabel = new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })
            const isToday = dateStr === getTodayStr()
            const hasExercise = row && row.exercise && row.exercise.trim().length > 0
            const exerciseSnippet = hasExercise
              ? (row!.exercise!.length > 18 ? row!.exercise!.slice(0, 16) + "…" : row!.exercise!)
              : null

            return (
              <button
                key={dateStr}
                onClick={() => openLog(dateStr)}
                title={row?.exercise ?? (row ? "No exercise logged — click to log" : "Click to log")}
                className={`flex-1 flex flex-col items-center gap-1 rounded-xl px-1 py-2 border transition-colors cursor-pointer hover:border-primary/50 hover:bg-primary/5 active:scale-95
                  ${isToday ? "border-primary/30 bg-primary/5" : "border-border/50 bg-card/40"}
                `}
              >
                {/* Day label */}
                <span className={`text-[9px] font-bold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground/60"}`}>
                  {dayLabel}
                </span>

                {/* Exercise indicator */}
                {hasExercise ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <Flame className="w-3.5 h-3.5 text-success" />
                    <span className="text-[8px] text-center text-success/80 leading-tight break-all">
                      {exerciseSnippet}
                    </span>
                  </div>
                ) : row ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-destructive/40" />
                    <span className="text-[8px] text-destructive/50">none</span>
                  </div>
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-border/40" />
                )}

                {/* Energy dots */}
                {row && (
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(n => (
                      <div
                        key={n}
                        className={`w-1 h-1 rounded-full ${n <= row.energy ? "bg-primary" : "bg-muted"}`}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-center">Tap a day to log</p>
      </div>

      {/* Log dialog */}
      <Dialog open={!!logDate} onOpenChange={v => { if (!v) setLogDate(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-success" />
              {logDayLabel}
            </DialogTitle>
            <DialogDescription>Log your exercise and energy for this day.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-success" />
                Exercise
              </label>
              <Textarea
                value={exercise}
                onChange={e => setExercise(e.target.value)}
                placeholder="e.g. 45-min weights, 5km run, 30-min boxing…"
                rows={3}
                className="resize-none"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Energy — {energy}/5
              </label>
              <input
                type="range" min={1} max={5} step={1}
                value={energy}
                onChange={e => setEnergy(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                <span>Burned out</span>
                <span>Unstoppable</span>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setLogDate(null)} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
                {saving
                  ? <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  : <CheckCircle2 className="w-4 h-4" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Build a natural-language pre-fill from outreach data. */
function outreachToWentWell(data: OutreachSummary): string {
  const { totals, byProduct } = data
  if (totals.emailsSent === 0 && totals.linkedinActions === 0) return ""

  const parts: string[] = []

  if (totals.emailsSent > 0) {
    const productLines = byProduct
      .filter(r => r.emailsSent > 0)
      .map(r => `${r.emailsSent} to ${r.productName ?? "unassigned"}`)
    if (productLines.length > 1) {
      parts.push(`Sent ${totals.emailsSent} emails (${productLines.join(", ")})`)
    } else {
      parts.push(`Sent ${totals.emailsSent} email${totals.emailsSent !== 1 ? "s" : ""}`)
    }
  }

  if (totals.linkedinActions > 0) {
    parts.push(`${totals.linkedinActions} LinkedIn action${totals.linkedinActions !== 1 ? "s" : ""}`)
  }

  return parts.join(". ") + "."
}

function DailyReflection() {
  const { createReflection } = useTodayMutations()
  const { summary } = useTodayData()
  const [open, setOpen] = useState(false)
  const form = useForm<any>({
    defaultValues: { wentWell: "", wentWrong: "", improvements: "", exercise: "", energy: 3 }
  })
  const [feedback, setFeedback] = useState<string|null>(null)
  const today = getTodayStr()

  // Fetch outreach for today — enabled only when dialog is open
  const outreachQ = useQuery<OutreachSummary>({
    queryKey: ["outreach-today", today],
    queryFn: () => fetchOutreachToday(today),
    staleTime: 30_000,
    enabled: open,
  })

  // Pre-fill "What went well?" with outreach data as soon as it arrives,
  // but only if the field is still blank (don't stomp edits).
  useEffect(() => {
    if (!open || !outreachQ.data) return
    const current = form.getValues("wentWell") as string
    if (current.trim() !== "") return
    const prefill = outreachToWentWell(outreachQ.data)
    if (prefill) form.setValue("wentWell", prefill)
  }, [open, outreachQ.data])

  const onSubmit = (data: any) => {
    createReflection.mutate({
      data: { ...data, date: today, energy: Number(data.energy) }
    }, {
      onSuccess: (res) => {
        if(res.coachFeedback) {
          setFeedback(res.coachFeedback)
        } else {
          setOpen(false)
        }
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full mt-6 mb-8 gap-2 h-14 border-dashed border-2">
          <Moon className="w-4 h-4" />
          Daily Reflection
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close out the day</DialogTitle>
        </DialogHeader>
        
        {feedback ? (
          <div className="space-y-6">
            <div className="bg-ai/10 p-6 rounded-2xl border border-ai/20 text-center">
              <h3 className="font-bold text-ai-foreground mb-4 font-mono uppercase tracking-wider text-xs">The Verdict</h3>
              <p className="text-foreground leading-relaxed">"{feedback}"</p>
            </div>
            <Button className="w-full" onClick={() => setOpen(false)}>Message Received</Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Today's outreach — shown as context above the free-text fields */}
              <OutreachSummaryCard date={today} />

              <FormField
                control={form.control}
                name="wentWell"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      What went well?
                      {outreachQ.data && outreachToWentWell(outreachQ.data) && (
                        <span className="text-[10px] text-primary/60 font-normal normal-case">
                          pre-filled from today's sends
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Textarea placeholder="Wins, momentum, revenue..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wentWrong"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What slowed you down?</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Distractions, technical debt, fear..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="exercise"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Dumbbell className="w-3.5 h-3.5 text-success" />
                      Exercise today
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. 45-min weights, 5km run, 30-min boxing... Be specific — vague answers get called out."
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground px-0.5">Leave blank and the coach will notice.</p>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="energy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Energy (1-5)</FormLabel>
                    <FormControl>
                      <Input type="range" min="1" max="5" {...field} />
                    </FormControl>
                    <div className="flex justify-between text-xs text-muted-foreground px-1">
                      <span>Burned out</span>
                      <span>Unstoppable</span>
                    </div>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full mt-4 h-14 text-lg font-semibold" disabled={createReflection.isPending}>
                {createReflection.isPending ? "Submitting..." : "Submit Reflection"}
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
