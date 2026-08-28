import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, Loader2, ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useProductDetail } from "@/hooks/use-products"
import { useToast } from "@/hooks/use-toast"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export default function ProductMyActions() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { data: product } = useProductDetail(productId)
  const { toast } = useToast()
  const qc = useQueryClient()

  const actionsQuery = useQuery({
    queryKey: ["my-actions", productId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/actions`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load actions")
      return res.json() as Promise<{
        items: Array<{
          id: number
          description: string
          actionType: string
          dueAt: string | null
          priority: number | null
          deal: { id: number; contactName: string; companyName: string | null; stage: string; health: string | null }
        }>
        buckets: { overdue: number; today: number; thisWeek: number }
      }>
    },
    enabled: productId > 0,
  })

  const metricsQuery = useQuery({
    queryKey: ["opp-metrics", productId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/metrics`, { credentials: "include" })
      if (!res.ok) throw new Error("metrics failed")
      return res.json()
    },
    enabled: productId > 0,
  })

  const completeMut = useMutation({
    mutationFn: async (actionId: number) => {
      const res = await fetch(`${BASE}/api/products/${productId}/opportunities/actions/${actionId}/complete`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Complete failed")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-actions", productId] })
      toast({ title: "Action completed" })
    },
  })

  const items = actionsQuery.data?.items ?? []
  const buckets = actionsQuery.data?.buckets
  const metrics = metricsQuery.data

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-24 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product?.name ?? "Product", href: `/products/${productId}` },
          { label: "My Actions" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/pipeline/${productId}`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Pipeline
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ListTodo className="h-5 w-5 text-amber-400" />
            My Actions
          </h1>
          <p className="text-xs text-muted-foreground">Deals that need your attention today.</p>
        </div>
      </div>

      {metrics && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Pipeline ARR" value={String(metrics.pipelineValue)} />
          <Metric label="Weighted" value={String(metrics.weightedPipeline)} />
          <Metric label="At risk" value={String(metrics.atRisk)} />
          <Metric label="Expected this month" value={String(metrics.expectedThisMonth)} />
        </div>
      )}

      {buckets && (
        <p className="text-xs text-muted-foreground">
          Overdue {buckets.overdue} · Today {buckets.today} · This week {buckets.thisWeek}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {actionsQuery.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No pending actions. Opportunities look clear.</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map(item => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div>
                  <Link href={`/products/${productId}/opportunities/${item.deal.id}`} className="text-sm font-medium hover:underline">
                    {item.deal.companyName || item.deal.contactName}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{item.actionType}</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{item.deal.stage}</Badge>
                    {item.deal.health && <Badge variant="outline" className="text-[10px] capitalize">{item.deal.health}</Badge>}
                    {item.dueAt && <span className="text-[10px] text-muted-foreground">Due {new Date(item.dueAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => completeMut.mutate(item.id)}>
                  <Check className="h-3.5 w-3.5" /> Done
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
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
