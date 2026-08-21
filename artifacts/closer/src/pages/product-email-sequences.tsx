import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, ListChecks, Loader2, Plus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProductDetail } from "@/hooks/use-products"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useToast } from "@/hooks/use-toast"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

type SavedSequence = {
  id: number
  name: string
  description: string | null
  stepCount: number
  createdAt: string
}

async function fetchSequences(productId: number): Promise<SavedSequence[]> {
  const response = await fetch(`${BASE}/api/email-sequences?productId=${productId}`, { credentials: "include" })
  if (!response.ok) throw new Error("Could not load email sequences")
  return response.json()
}

export default function ProductEmailSequences() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { data: product, isLoading: productLoading } = useProductDetail(productId)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const sequencesQuery = useQuery({
    queryKey: ["product-email-sequences", productId],
    queryFn: () => fetchSequences(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  })

  const deleteSequence = useMutation({
    mutationFn: async (sequenceId: number) => {
      const response = await fetch(`${BASE}/api/email-sequences/${sequenceId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!response.ok) throw new Error("Could not delete the sequence")
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product-email-sequences", productId] })
      toast({ title: "Sequence deleted" })
    },
    onError: (error: Error) => toast({ title: "Could not delete sequence", description: error.message, variant: "destructive" }),
  })

  if (productLoading) {
    return <div className="space-y-4 p-4 animate-pulse"><div className="h-5 w-48 rounded bg-muted" /><div className="h-36 rounded-2xl bg-muted" /></div>
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  const sequences = sequencesQuery.data ?? []

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-24 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${productId}` },
          { label: "Email Settings", href: `/products/${productId}/email` },
          { label: "Sequences" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Email sequences
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Build, review, and reuse outreach templates for {product.name}.
          </p>
        </div>
        <Link
          href={`/products/${productId}/email/sequences/new`}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Create sequence
        </Link>
      </div>

      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">A focused template builder</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Create in a dedicated workspace with room to set your brief, adjust timing, edit every email, and save as one template.
            </p>
          </div>
        </div>
      </div>

      {sequencesQuery.isLoading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-2xl bg-muted animate-pulse" />
          <div className="h-20 rounded-2xl bg-muted animate-pulse" />
        </div>
      ) : sequencesQuery.isError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          Could not load saved sequences. Refresh and try again.
        </div>
      ) : sequences.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <Sparkles className="mx-auto h-9 w-9 text-violet-400/50" />
          <h2 className="mt-3 text-sm font-semibold">No saved sequences yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Start with a short brief, then use AI or a blank canvas to shape every email in the series.
          </p>
          <Link
            href={`/products/${productId}/email/sequences/new`}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 text-xs font-medium text-violet-300 hover:bg-violet-500/15"
          >
            <Plus className="h-3.5 w-3.5" />
            Build your first sequence
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saved templates</h2>
          {sequences.map(sequence => (
            <div key={sequence.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{sequence.name}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {sequence.stepCount} {sequence.stepCount === 1 ? "email" : "emails"}
                  </span>
                </div>
                {sequence.description && <p className="mt-1 truncate text-xs text-muted-foreground">{sequence.description}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Saved {new Date(sequence.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/products/${productId}/email/sequences/${sequence.id}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  disabled={deleteSequence.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete "${sequence.name}"? This cannot be undone.`)) deleteSequence.mutate(sequence.id)
                  }}
                  aria-label={`Delete ${sequence.name}`}
                >
                  {deleteSequence.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/products/${productId}/email/lists`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-4 transition-colors hover:bg-orange-500/[0.08]"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400"><ListChecks className="h-4 w-4" /></span>
          <span>
            <span className="block text-sm font-semibold text-foreground">Need an audience first?</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Create and manage contact lists on their own page.</span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-orange-400" />
      </Link>
    </div>
  )
}