import { useParams } from "wouter"
import { useProductDetail } from "@/hooks/use-products"
import { Sparkles } from "lucide-react"
import { ProductSocialTab } from "@/pages/product-social"
import { Breadcrumbs } from "@/components/breadcrumbs"

export default function ProductSectionSocial() {
  const params = useParams()
  const id = Number(params.id)
  const { data: product, isLoading } = useProductDetail(id)

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-4 w-56 bg-muted rounded" />
        <div className="h-64 bg-muted rounded-2xl" />
      </div>
    )
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-5 px-4">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${id}` },
          { label: "Social Media" },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-400" />
          Social Media
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Content calendar, post generation and scheduling for this product.
        </p>
      </div>

      {/* Content */}
      <ProductSocialTab productId={id} productName={product.name} />
    </div>
  )
}
