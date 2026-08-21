import { useProductsData, useProductsMutations } from "@/hooks/use-products"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Package, Globe, Loader2, CheckCircle2, GripVertical, MoreVertical, EyeOff, Eye, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { productSchema, ProductForm } from "@/lib/schemas"
import { useState } from "react"
import { Link } from "wouter"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { getGetProductQueryKey, getListProductsQueryKey } from "@workspace/api-client-react"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

async function triggerAnalyze(productId: number): Promise<void> {
  await fetch(`${BASE}/api/products/${productId}/analyze`, {
    method: "POST",
    credentials: "include",
  })
}

// ── Sortable product card ──────────────────────────────────────────────────
type Product = NonNullable<ReturnType<typeof useProductsData>["products"]["data"]>[number]

// ── Delete confirmation dialog ─────────────────────────────────────────────
function DeleteProductDialog({
  product,
  open,
  onClose,
}: {
  product: Product
  open: boolean
  onClose: () => void
}) {
  const { deleteProduct } = useProductsMutations()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState("")
  const ready = confirm === "Delete"

  const handleDelete = () => {
    if (!ready) return
    deleteProduct.mutate({ id: product.id }, {
      onSuccess: () => {
        toast({ title: `"${product.name}" deleted` })
        onClose()
      },
      onError: () => toast({ title: "Failed to delete product", variant: "destructive" }),
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete "{product.name}"?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This permanently removes the product and all associated data. Leads linked to it will lose their product association.
        </p>
        <p className="text-sm text-foreground mt-1">
          Type <span className="font-mono font-bold text-destructive">Delete</span> to confirm.
        </p>
        <Input
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Delete"
          className="bg-muted/40 border-border/30"
          autoFocus
          onKeyDown={e => e.key === "Enter" && handleDelete()}
        />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-border/30" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={!ready || deleteProduct.isPending}
            onClick={handleDelete}
          >
            {deleteProduct.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete permanently"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SortableProductCard({ prod }: { prod: Product }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const isOwner = user?.role === "owner"
  const [deleteOpen, setDeleteOpen] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prod.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const isInactive = prod.status === "inactive"

  const toggleActive = async (e: React.MouseEvent) => {
    e.preventDefault()
    const newStatus = isInactive ? "active" : "inactive"
    const res = await fetch(`${BASE}/api/products/${prod.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() })
      toast({ title: isInactive ? `"${prod.name}" reactivated` : `"${prod.name}" set to inactive` })
    } else {
      toast({ title: "Failed to update product", variant: "destructive" })
    }
  }

  return (
    <div ref={setNodeRef} style={style}>
      <DeleteProductDialog product={prod} open={deleteOpen} onClose={() => setDeleteOpen(false)} />
      <Card className={cn(
        "border-border transition-colors",
        isDragging ? "border-primary/50 shadow-lg" : "hover:border-primary/30",
        isInactive && "opacity-60"
      )}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Drag handle */}
            <button
              {...attributes}
              {...listeners}
              className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none shrink-0"
              aria-label="Drag to reorder"
              onClick={e => e.preventDefault()}
            >
              <GripVertical className="w-4 h-4" />
            </button>

            {/* Card body — navigates */}
            <Link href={`/products/${prod.id}`} className="flex-1 min-w-0">
              <div className="flex justify-between items-start gap-3 mb-2">
                <h3 className="font-semibold text-lg truncate">{prod.name}</h3>
                <Badge
                  variant={prod.status === 'active' ? 'default' : 'secondary'}
                  className="capitalize text-[10px] shrink-0"
                >
                  {prod.status}
                </Badge>
              </div>
              {prod.tagline && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{prod.tagline}</p>
              )}
              {prod.websiteUrl && (
                <p className="text-xs text-muted-foreground/60 truncate flex items-center gap-1 mb-2">
                  <Globe className="w-3 h-3 shrink-0" />
                  {prod.websiteUrl.replace(/^https?:\/\//, '')}
                </p>
              )}
              <div className="text-xs font-medium text-primary">Open Command Center →</div>
            </Link>

            {/* Owner-only actions menu */}
            {isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="mt-0.5 p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0 rounded"
                    onClick={e => e.preventDefault()}
                    aria-label="Product actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={toggleActive}
                    className="gap-2"
                  >
                    {isInactive
                      ? <><Eye className="w-4 h-4" /> Reactivate</>
                      : <><EyeOff className="w-4 h-4" /> Make inactive</>
                    }
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={e => { e.preventDefault(); setDeleteOpen(true) }}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Products page ──────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { products } = useProductsData()
  const queryClient = useQueryClient()
  const [optimisticList, setOptimisticList] = useState<Product[] | null>(null)

  const reorderMut = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch(`${BASE}/api/products/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error("Reorder failed")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
      setOptimisticList(null)
    },
    onError: () => {
      // Revert to server state
      setOptimisticList(null)
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  if (products.isLoading) {
    return <div className="p-4"><div className="h-40 bg-muted animate-pulse rounded-2xl" /></div>
  }

  const list = optimisticList ?? products.data ?? []

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = list.findIndex(p => p.id === active.id)
    const newIdx = list.findIndex(p => p.id === over.id)
    const reordered = arrayMove(list, oldIdx, newIdx)
    setOptimisticList(reordered)
    reorderMut.mutate(reordered.map(p => p.id))
  }

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-6 px-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">Products</h1>
        <AddProductDialog />
      </div>

      {list.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No products yet</h3>
          <p className="text-muted-foreground text-sm">Add your first offering to start tracking.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={list.map(p => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {list.map(prod => (
                <SortableProductCard key={prod.id} prod={prod} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

type AnalyzeState = "idle" | "analyzing" | "done" | "error"

function AddProductDialog() {
  const { createProduct } = useProductsMutations()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>("idle")

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", status: "active", websiteUrl: "" }
  })

  const onSubmit = async (data: ProductForm) => {
    createProduct.mutate({ data: {
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      targetMarket: data.targetMarket,
      status: data.status,
      websiteUrl: data.websiteUrl || undefined,
    }}, {
      onSuccess: async (product) => {
        const hasUrl = !!data.websiteUrl?.trim()

        if (hasUrl) {
          setAnalyzeState("analyzing")
          try {
            await triggerAnalyze(product.id)
            setAnalyzeState("done")
            // Refresh product data so detail page shows AI intel
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
            queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(product.id) })
            setTimeout(() => {
              setOpen(false)
              setAnalyzeState("idle")
              form.reset()
            }, 1200)
          } catch {
            setAnalyzeState("error")
            setTimeout(() => {
              setOpen(false)
              setAnalyzeState("idle")
              form.reset()
            }, 2000)
          }
        } else {
          setOpen(false)
          form.reset()
        }
      }
    })
  }

  const handleOpenChange = (v: boolean) => {
    if (analyzeState === "analyzing") return // block close during analysis
    setOpen(v)
    if (!v) { form.reset(); setAnalyzeState("idle") }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" className="rounded-full w-11 h-11 shadow-sm shrink-0">
          <Plus className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
        </DialogHeader>

        {/* Analysis progress overlay */}
        {(analyzeState === "analyzing" || analyzeState === "done" || analyzeState === "error") && (
          <div className="flex flex-col items-center gap-4 py-8">
            {analyzeState === "analyzing" && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-semibold text-foreground">Analysing website…</p>
                  <p className="text-sm text-muted-foreground">Scraping and running AI — takes 10–20 seconds</p>
                </div>
              </>
            )}
            {analyzeState === "done" && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-400" />
                </div>
                <p className="font-semibold text-foreground">Intelligence captured!</p>
              </>
            )}
            {analyzeState === "error" && (
              <p className="text-sm text-destructive text-center">Analysis failed — product saved, you can re-analyze from the detail page.</p>
            )}
          </div>
        )}

        {analyzeState === "idle" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input {...field} autoFocus /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="websiteUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      Website URL
                      <span className="text-muted-foreground font-normal text-xs">(AI will analyse it automatically)</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://yourproduct.com" type="url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tagline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tagline <span className="text-muted-foreground font-normal text-xs">(AI fills this if URL provided)</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="idea">Idea</SelectItem>
                        <SelectItem value="launching">Launching</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full mt-4 min-h-[44px]"
                disabled={createProduct.isPending}
              >
                {createProduct.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Product"}
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
