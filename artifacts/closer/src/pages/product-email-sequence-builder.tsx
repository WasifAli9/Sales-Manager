import { Link, useParams } from "wouter"
import { ArrowLeft, Sparkles } from "lucide-react"
import { useProductDetail } from "@/hooks/use-products"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { ProductSequenceWorkspace } from "./product-section-email"

export default function ProductEmailSequenceBuilder() {
  const params = useParams<{ id: string; sequenceId?: string }>()
  const productId = Number(params.id)
  const sequenceId = params.sequenceId ? Number(params.sequenceId) : undefined
  const { data: product, isLoading } = useProductDetail(productId)

  if (isLoading) {
    return <div className="space-y-4 p-4 animate-pulse"><div className="h-5 w-56 rounded bg-muted" /><div className="h-[420px] rounded-2xl bg-muted" /></div>
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-28 lg:pb-12">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${productId}` },
          { label: "Email Settings", href: `/products/${productId}/email` },
          { label: "Sequences", href: `/products/${productId}/email/sequences` },
          { label: sequenceId ? "Edit sequence" : "New sequence" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-violet-400" />
            {sequenceId ? "Edit email sequence" : "Build an email sequence"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Give the AI direction, then review and refine every email before saving.
          </p>
        </div>
        <Link
          href={`/products/${productId}/email/sequences`}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All sequences
        </Link>
      </div>

      <ProductSequenceWorkspace
        product={product}
        productId={productId}
        initialSequenceId={Number.isInteger(sequenceId) ? sequenceId : undefined}
      />
    </div>
  )
}