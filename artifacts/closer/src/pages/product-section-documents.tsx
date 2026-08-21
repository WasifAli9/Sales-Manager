import { useParams, useSearch } from "wouter"
import { useProductDetail } from "@/hooks/use-products"
import { FileText } from "lucide-react"
import { ProductDocuments } from "@/components/product-documents"
import { Breadcrumbs } from "@/components/breadcrumbs"

export default function ProductSectionDocuments() {
  const params = useParams()
  const id = Number(params.id)
  const search = useSearch()
  const { data: product, isLoading } = useProductDetail(id)
  const documentId = Number(new URLSearchParams(search).get("document"))

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-4 w-56 bg-muted rounded" />
        <div className="h-48 bg-muted rounded-2xl" />
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
          { label: "Documents" },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-400" />
          Documents
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sales materials, decks and resources for this product.
        </p>
      </div>

      {/* Content */}
      <ProductDocuments productId={id} initialOpenDocumentId={Number.isInteger(documentId) && documentId > 0 ? documentId : undefined} />
    </div>
  )
}
