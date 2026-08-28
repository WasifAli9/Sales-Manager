import { Link } from "wouter"
import type { ReactNode } from "react"
import { useState } from "react"
import { AlertTriangle, Bot, Check, Clock, Loader2, RefreshCw, ShieldAlert, Sparkles, ThumbsUp, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useProductsData } from "@/hooks/use-products"
import {
  useEndOfDayReview,
  useMyDay,
  useMyDayMutations,
  type PlannerItem,
} from "@/hooks/use-my-day"

function levelColor(level: string) {
  if (level === "critical") return "bg-destructive/15 text-destructive border-destructive/30"
  if (level === "high") return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
  if (level === "medium") return "bg-primary/10 text-primary border-primary/20"
  return "bg-muted text-muted-foreground border-border"
}

function PlannerRow({
  item,
  onComplete,
  onApprove,
  onSnooze,
  onDelegate,
  busy,
}: {
  item: PlannerItem
  onComplete: () => void
  onApprove?: () => void
  onSnooze: () => void
  onDelegate: () => void
  busy: boolean
}) {
  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{item.title}</span>
          <Badge variant="outline" className={`text-[10px] ${levelColor(item.priorityLevel)}`}>
            {item.priorityLevel} · {item.priorityScore}
          </Badge>
          {item.productName && (
            <span className="text-[10px] text-muted-foreground">{item.productName}</span>
          )}
        </div>
        {item.whyItMatters && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.whyItMatters}</p>
        )}
        {item.estimatedMinutes != null && item.executionType !== "ai_handles" && (
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            ~{item.estimatedMinutes}m
          </p>
        )}
        {item.deepLink && (
          <Link href={item.deepLink} className="mt-1 inline-block text-xs text-primary hover:underline">
            Open →
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 shrink-0">
        {item.executionType === "user_approves" && onApprove ? (
          <Button size="sm" className="h-8 rounded-xl text-xs" disabled={busy} onClick={onApprove}>
            <ThumbsUp className="mr-1 h-3 w-3" /> Approve
          </Button>
        ) : item.executionType !== "ai_handles" ? (
          <Button size="sm" className="h-8 rounded-xl text-xs" disabled={busy} onClick={onComplete}>
            <Check className="mr-1 h-3 w-3" /> Done
          </Button>
        ) : null}
        {item.executionType !== "ai_handles" && (
          <>
            <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs" disabled={busy} onClick={onSnooze}>
              <Clock className="mr-1 h-3 w-3" /> Snooze
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs" disabled={busy} onClick={onDelegate}>
              <Bot className="mr-1 h-3 w-3" /> Delegate
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

export function MyDayCommandCentre() {
  const { products } = useProductsData()
  const [productFilter, setProductFilter] = useState<number | null>(null)
  const [showEod, setShowEod] = useState(false)
  const myDay = useMyDay(productFilter)
  const mut = useMyDayMutations(productFilter)
  const eod = useEndOfDayReview(showEod)

  const productList = products.data ?? []
  const data = myDay.data
  const busy =
    mut.complete.isPending ||
    mut.approve.isPending ||
    mut.snooze.isPending ||
    mut.delegate.isPending ||
    mut.rebuild.isPending

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-primary" />
            My Day
          </h2>
          <p className="text-xs text-muted-foreground">
            Founder priorities across {productFilter ? "this business" : "all businesses"}
            {data?.plan ? ` · ${data.plan.availableMinutes}m budget` : ""}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl text-xs"
            disabled={busy}
            onClick={() => mut.rebuild.mutate({})}
          >
            {mut.rebuild.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1">Replan</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs" onClick={() => setShowEod((v) => !v)}>
            EOD
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          type="button"
          onClick={() => setProductFilter(null)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
            productFilter === null
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All Businesses
        </button>
        {productList.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProductFilter(p.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              productFilter === p.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {myDay.isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Building your day…
        </div>
      ) : myDay.isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load My Day. Try Replan.
        </div>
      ) : data ? (
        <>
          {data.critical.length > 0 && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <ShieldAlert className="h-4 w-4" />
                Critical alerts ({data.critical.length})
              </div>
              <ul className="space-y-1">
                {data.critical.slice(0, 3).map((c) => (
                  <li key={c.id} className="text-xs text-destructive/90">
                    {c.title}
                    {c.deepLink && (
                      <Link href={c.deepLink} className="ml-2 underline">
                        Open
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.summary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Approvals" value={data.summary.approvals} />
              <Stat label="You act" value={data.summary.acts} />
              <Stat label="SM handling" value={data.summary.aiHandling} />
              <Stat label="At risk" value={data.summary.atRisk} />
            </div>
          )}

          {data.oneThing && (
            <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <User className="h-3.5 w-3.5" />
                The One Thing
              </div>
              <p className="text-base font-semibold text-foreground">{data.oneThing.title}</p>
              {data.oneThing.whyItMatters && (
                <p className="text-xs text-muted-foreground">{data.oneThing.whyItMatters}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.oneThing.executionType === "user_approves" ? (
                  <Button
                    size="sm"
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() => {
                      mut.approve.mutate(data.oneThing!.id, {
                        onSuccess: (res) => {
                          if (res.deepLink) window.location.href = res.deepLink
                        },
                      })
                    }}
                  >
                    Approve
                  </Button>
                ) : (
                  <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => mut.complete.mutate(data.oneThing!.id)}>
                    Mark done
                  </Button>
                )}
                {data.oneThing.deepLink && (
                  <Button size="sm" variant="outline" className="rounded-xl" asChild>
                    <Link href={data.oneThing.deepLink}>Go</Link>
                  </Button>
                )}
              </div>
            </section>
          )}

          <Section title="Needs your approval" empty="No drafts waiting.">
            {data.needsApproval.map((item) => (
              <PlannerRow
                key={item.id}
                item={item}
                busy={busy}
                onComplete={() => mut.complete.mutate(item.id)}
                onApprove={() => {
                  mut.approve.mutate(item.id, {
                    onSuccess: (res) => {
                      if (res.deepLink) window.location.href = res.deepLink
                    },
                  })
                }}
                onSnooze={() => mut.snooze.mutate({ itemId: item.id })}
                onDelegate={() => mut.delegate.mutate(item.id)}
              />
            ))}
          </Section>

          <Section title="You act" empty="No founder actions queued.">
            {data.userActs
              .filter((i) => i.id !== data.oneThing?.id)
              .map((item) => (
                <PlannerRow
                  key={item.id}
                  item={item}
                  busy={busy}
                  onComplete={() => mut.complete.mutate(item.id)}
                  onSnooze={() => mut.snooze.mutate({ itemId: item.id })}
                  onDelegate={() => mut.delegate.mutate(item.id)}
                />
              ))}
          </Section>

          {(data.atRisk.length > 0 || data.summary.atRisk > 0) && (
            <Section title="At risk / exceptions" empty="Nothing critical.">
              {data.atRisk.map((item) => (
                <li key={item.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <span className="font-medium">{item.title}</span>
                    {item.productName && (
                      <span className="ml-2 text-[10px] text-muted-foreground">{item.productName}</span>
                    )}
                    {item.deepLink && (
                      <Link href={item.deepLink} className="ml-2 text-xs text-primary hover:underline">
                        Open
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </Section>
          )}

          <Section title={`Sales Manager is handling (${data.aiHandles.length})`} empty="Nothing on autopilot.">
            {data.aiHandles.map((item) => (
              <li key={item.id} className="flex items-start gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{item.title}</span>
              </li>
            ))}
          </Section>

          {showEod && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <h3 className="text-sm font-semibold">End of day review</h3>
              {eod.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : eod.data ? (
                <>
                  <p className="text-sm text-foreground">{eod.data.message}</p>
                  {eod.data.tomorrowCandidates.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {eod.data.tomorrowCandidates.map((c) => (
                        <li key={c.id}>→ {c.title}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={!!data.preferences.revenueFirst}
                onChange={(e) => mut.updatePrefs.mutate({ revenueFirst: e.target.checked })}
              />
              Revenue first
            </label>
            <span>·</span>
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() =>
                mut.updatePrefs.mutate(
                  { defaultAvailableMinutes: data.preferences.defaultAvailableMinutes === 240 ? 120 : 240 },
                  { onSuccess: () => mut.rebuild.mutate({}) },
                )
              }
            >
              Toggle {data.preferences.defaultAvailableMinutes === 240 ? "2h" : "4h"} day
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Section({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: ReactNode
}) {
  const childArr = (Array.isArray(children) ? children : [children]).flat().filter(Boolean)
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border/60 px-3 py-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {childArr.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/50">{children}</ul>
      )}
    </section>
  )
}
