import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, CheckSquare2, ListChecks, Loader2, Plus, Search, Square, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useProductDetail } from "@/hooks/use-products"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useToast } from "@/hooks/use-toast"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

type ContactList = {
  id: number
  name: string
  memberCount: number
  createdAt: string
}

type Lead = {
  id: number
  firstName: string
  lastName: string
  email: string | null
  company: string | null
}

const leadName = (lead: Lead) => [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead"

async function fetchContactLists(productId: number): Promise<ContactList[]> {
  const response = await fetch(`${BASE}/api/contact-lists?productId=${productId}`, { credentials: "include" })
  if (!response.ok) throw new Error("Could not load contact lists")
  return response.json()
}

async function fetchProductLeads(productId: number): Promise<Lead[]> {
  const response = await fetch(`${BASE}/api/leads?productId=${productId}`, { credentials: "include" })
  if (!response.ok) throw new Error("Could not load product leads")
  return response.json()
}

export default function ProductEmailLists() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { data: product, isLoading: productLoading } = useProductDetail(productId)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [search, setSearch] = useState("")
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set())
  const [hasSetInitialSelection, setHasSetInitialSelection] = useState(false)

  const listsQuery = useQuery({
    queryKey: ["contact-lists", productId],
    queryFn: () => fetchContactLists(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  })
  const leadsQuery = useQuery({
    queryKey: ["product-contact-list-leads", productId],
    queryFn: () => fetchProductLeads(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  })

  const selectableLeads = useMemo(
    () => (leadsQuery.data ?? []).filter(lead => Boolean(lead.email)),
    [leadsQuery.data],
  )
  const visibleLeads = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return selectableLeads
    return selectableLeads.filter(lead =>
      [leadName(lead), lead.email, lead.company].filter(Boolean).join(" ").toLowerCase().includes(term),
    )
  }, [search, selectableLeads])

  useEffect(() => {
    if (hasSetInitialSelection || !leadsQuery.data) return
    setSelectedLeadIds(new Set(selectableLeads.map(lead => lead.id)))
    setHasSetInitialSelection(true)
  }, [hasSetInitialSelection, leadsQuery.data, selectableLeads])

  const createList = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${BASE}/api/contact-lists`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), productId, leadIds: [...selectedLeadIds] }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not create the contact list")
      return result as ContactList
    },
    onSuccess: async (list) => {
      setName("")
      await queryClient.invalidateQueries({ queryKey: ["contact-lists", productId] })
      toast({ title: "Contact list created", description: `${list.memberCount} contact${list.memberCount === 1 ? "" : "s"} added to ${list.name}.` })
    },
    onError: (error: Error) => toast({ title: "Could not create list", description: error.message, variant: "destructive" }),
  })

  const deleteList = useMutation({
    mutationFn: async (listId: number) => {
      const response = await fetch(`${BASE}/api/contact-lists/${listId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!response.ok) throw new Error("Could not delete the contact list")
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contact-lists", productId] })
      toast({ title: "Contact list deleted" })
    },
    onError: (error: Error) => toast({ title: "Could not delete list", description: error.message, variant: "destructive" }),
  })

  const toggleLead = (leadId: number) => {
    setSelectedLeadIds(current => {
      const next = new Set(current)
      next.has(leadId) ? next.delete(leadId) : next.add(leadId)
      return next
    })
  }

  const allVisibleSelected = visibleLeads.length > 0 && visibleLeads.every(lead => selectedLeadIds.has(lead.id))
  const toggleVisibleLeads = () => {
    setSelectedLeadIds(current => {
      const next = new Set(current)
      if (allVisibleSelected) visibleLeads.forEach(lead => next.delete(lead.id))
      else visibleLeads.forEach(lead => next.add(lead.id))
      return next
    })
  }

  if (productLoading) {
    return <div className="space-y-4 p-4 animate-pulse"><div className="h-5 w-48 rounded bg-muted" /><div className="h-[420px] rounded-2xl bg-muted" /></div>
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  const lists = listsQuery.data ?? []

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-24 lg:pb-10">
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${productId}` },
          { label: "Email Settings", href: `/products/${productId}/email` },
          { label: "Contact lists" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ListChecks className="h-5 w-5 text-orange-400" />
            Contact lists
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose eligible product leads and save them as reusable campaign audiences.
          </p>
        </div>
        <Link
          href={`/products/${productId}/email/sequences`}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Sequences
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="rounded-2xl border border-orange-500/20 bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Create a reusable audience</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Only leads with an email address are shown, so this list is ready for campaign delivery.
              </p>
            </div>
            <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-300">
              {selectedLeadIds.size} selected
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">List name</label>
              <Input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="e.g. Qualified UK operations leads"
                maxLength={120}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search product leads"
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl gap-2"
                onClick={toggleVisibleLeads}
                disabled={visibleLeads.length === 0}
              >
                {allVisibleSelected ? <Square className="h-4 w-4" /> : <CheckSquare2 className="h-4 w-4" />}
                {allVisibleSelected ? "Clear visible" : "Select visible"}
              </Button>
            </div>

            <div className="max-h-[430px] overflow-y-auto rounded-xl border border-border/70">
              {leadsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading product leads…
                </div>
              ) : visibleLeads.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {search ? "No eligible leads match that search." : "This product has no leads with an email address yet."}
                </div>
              ) : (
                <div className="divide-y divide-border/70">
                  {visibleLeads.map(lead => {
                    const selected = selectedLeadIds.has(lead.id)
                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => toggleLead(lead.id)}
                        className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${selected ? "bg-orange-500/[0.07]" : "hover:bg-muted/60"}`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-orange-400 bg-orange-500 text-white" : "border-border bg-background"}`}>
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{leadName(lead)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[lead.company, lead.email].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <Button
              className="h-11 w-full gap-2 rounded-xl"
              onClick={() => createList.mutate()}
              disabled={!name.trim() || selectedLeadIds.size === 0 || createList.isPending}
            >
              {createList.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save {selectedLeadIds.size} selected contact{selectedLeadIds.size === 1 ? "" : "s"} as a list
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Saved audiences</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Ready to select when launching a sequence campaign.</p>
            </div>
            <Users className="h-5 w-5 text-orange-400" />
          </div>

          {listsQuery.isLoading ? (
            <div className="h-24 rounded-2xl bg-muted animate-pulse" />
          ) : listsQuery.isError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              Could not load saved contact lists.
            </div>
          ) : lists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <Users className="mx-auto h-8 w-8 text-orange-400/50" />
              <p className="mt-3 text-sm font-semibold">No saved audiences</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Select product leads on the left, name the audience, and save it for future campaigns.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lists.map(list => (
                <div key={list.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{list.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {list.memberCount} contact{list.memberCount === 1 ? "" : "s"} · Created {new Date(list.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={deleteList.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${list.name}"? This cannot be undone.`)) deleteList.mutate(list.id)
                    }}
                    aria-label={`Delete ${list.name}`}
                  >
                    {deleteList.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}