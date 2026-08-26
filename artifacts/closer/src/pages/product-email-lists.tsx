import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "wouter"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, CheckSquare2, ListChecks, Loader2, Pencil, Plus, Search, Square, Trash2, UserPlus, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

type NewContactForm = {
  firstName: string
  lastName: string
  email: string
  company: string
  title: string
  phone: string
}

const emptyContactForm = (): NewContactForm => ({
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  title: "",
  phone: "",
})

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

async function fetchContactListDetail(listId: number): Promise<ContactList & { members: Lead[] }> {
  const response = await fetch(`${BASE}/api/contact-lists/${listId}`, { credentials: "include" })
  if (!response.ok) throw new Error("Could not load contact list")
  return response.json()
}

async function createProductContact(productId: number, form: NewContactForm): Promise<Lead> {
  const response = await fetch(`${BASE}/api/leads`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      company: form.company.trim() || null,
      title: form.title.trim() || null,
      phone: form.phone.trim() || null,
      productId,
      leadType: "end_user",
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || "Failed to create contact")
  return result as Lead
}

function AddContactDialog({
  open,
  onClose,
  productId,
  productName,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  productId: number
  productName: string
  onCreated: (lead: Lead) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<NewContactForm>(emptyContactForm)

  useEffect(() => {
    if (open) setForm(emptyContactForm())
  }, [open])

  const mut = useMutation({
    mutationFn: () => createProductContact(productId, form),
    onSuccess: (lead) => {
      toast({ title: "Contact added", description: "They’ll appear in this product’s eligible leads." })
      onCreated(lead)
      onClose()
    },
    onError: (error: Error) => toast({ title: "Could not add contact", description: error.message, variant: "destructive" }),
  })

  const setField = (field: keyof NewContactForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm(current => ({ ...current, [field]: event.target.value }))

  const emailOk = form.email.trim().includes("@")
  const canSubmit = emailOk && (form.firstName.trim() || form.lastName.trim() || form.email.trim())

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto border-border/30 bg-card">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Added to <span className="font-medium text-foreground">{productName}</span>. An email address is required so they can be used in campaign lists.
        </p>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">First name</p>
              <Input value={form.firstName} onChange={setField("firstName")} placeholder="Jane" className="bg-muted/40 border-border/30" autoFocus />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Last name</p>
              <Input value={form.lastName} onChange={setField("lastName")} placeholder="Smith" className="bg-muted/40 border-border/30" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Email <span className="text-orange-300">*</span></p>
            <Input value={form.email} onChange={setField("email")} placeholder="jane@company.com" type="email" className="bg-muted/40 border-border/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Company</p>
              <Input value={form.company} onChange={setField("company")} placeholder="Acme Corp" className="bg-muted/40 border-border/30" />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Title</p>
              <Input value={form.title} onChange={setField("title")} placeholder="CEO" className="bg-muted/40 border-border/30" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Phone</p>
            <Input value={form.phone} onChange={setField("phone")} placeholder="+44 7700 000000" className="bg-muted/40 border-border/30" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 border-border/30" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1"
              onClick={() => mut.mutate()}
              disabled={!canSubmit || mut.isPending}
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {mut.isPending ? "Adding…" : "Add Contact"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
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
  const [editingListId, setEditingListId] = useState<number | null>(null)
  const [loadingListId, setLoadingListId] = useState<number | null>(null)
  const [addContactOpen, setAddContactOpen] = useState(false)

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

  const editingList = listsQuery.data?.find(list => list.id === editingListId) ?? null
  const isEditing = editingListId !== null

  const startNewList = () => {
    setEditingListId(null)
    setName("")
    setSelectedLeadIds(new Set())
    setSearch("")
  }

  const loadListForEdit = async (listId: number) => {
    setLoadingListId(listId)
    try {
      const detail = await fetchContactListDetail(listId)
      setEditingListId(detail.id)
      setName(detail.name)
      setSelectedLeadIds(new Set(detail.members.map(member => member.id)))
      setSearch("")
      toast({ title: `Editing “${detail.name}”`, description: "Add or remove contacts, then save your changes." })
    } catch (error) {
      toast({
        title: "Could not open list",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoadingListId(null)
    }
  }

  const saveList = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), productId, leadIds: [...selectedLeadIds] }
      const response = await fetch(
        isEditing ? `${BASE}/api/contact-lists/${editingListId}` : `${BASE}/api/contact-lists`,
        {
          method: isEditing ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || (isEditing ? "Could not update the contact list" : "Could not create the contact list"))
      return result as ContactList
    },
    onSuccess: async (list) => {
      await queryClient.invalidateQueries({ queryKey: ["contact-lists", productId] })
      if (isEditing) {
        toast({ title: "Contact list updated", description: `${list.memberCount} contact${list.memberCount === 1 ? "" : "s"} in ${list.name}.` })
        setEditingListId(list.id)
      } else {
        toast({ title: "Contact list created", description: `${list.memberCount} contact${list.memberCount === 1 ? "" : "s"} added to ${list.name}.` })
        // Stay on the new list in edit mode so more members can be added immediately
        setEditingListId(list.id)
        setName(list.name)
      }
    },
    onError: (error: Error) => toast({
      title: isEditing ? "Could not update list" : "Could not create list",
      description: error.message,
      variant: "destructive",
    }),
  })

  const deleteList = useMutation({
    mutationFn: async (listId: number) => {
      const response = await fetch(`${BASE}/api/contact-lists/${listId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!response.ok) throw new Error("Could not delete the contact list")
      return listId
    },
    onSuccess: async (listId) => {
      await queryClient.invalidateQueries({ queryKey: ["contact-lists", productId] })
      if (editingListId === listId) startNewList()
      toast({ title: "Contact list deleted" })
    },
    onError: (error: Error) => toast({ title: "Could not delete list", description: error.message, variant: "destructive" }),
  })

  const handleContactCreated = async (lead: Lead) => {
    await queryClient.invalidateQueries({ queryKey: ["product-contact-list-leads", productId] })
    await queryClient.invalidateQueries({ queryKey: ["leads"] })
    if (lead.email) {
      setSelectedLeadIds(current => new Set(current).add(lead.id))
    }
  }

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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="h-9 gap-1.5 rounded-xl"
            onClick={() => setAddContactOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Contact
          </Button>
          <Link
            href={`/products/${productId}/email/sequences`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Sequences
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="rounded-2xl border border-orange-500/20 bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {isEditing ? `Edit “${editingList?.name ?? name}”` : "Create a reusable audience"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isEditing
                  ? "Tick more contacts to add them, untick to remove, then save. Or start a new list anytime."
                  : "Only leads with an email address are shown, so this list is ready for campaign delivery."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isEditing && (
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={startNewList}>
                  <X className="h-3.5 w-3.5" />
                  New list
                </Button>
              )}
              <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-300">
                {selectedLeadIds.size} selected
              </span>
            </div>
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
                onClick={() => setAddContactOpen(true)}
              >
                <UserPlus className="h-4 w-4" />
                Add Contact
              </Button>
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
                  {search ? "No eligible leads match that search." : (
                    <div className="space-y-3">
                      <p>This product has no leads with an email address yet.</p>
                      <Button type="button" size="sm" className="gap-1.5 rounded-xl" onClick={() => setAddContactOpen(true)}>
                        <UserPlus className="h-3.5 w-3.5" />
                        Add Contact
                      </Button>
                    </div>
                  )}
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
              onClick={() => saveList.mutate()}
              disabled={!name.trim() || selectedLeadIds.size === 0 || saveList.isPending}
            >
              {saveList.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isEditing
                ? `Save changes · ${selectedLeadIds.size} contact${selectedLeadIds.size === 1 ? "" : "s"}`
                : `Save ${selectedLeadIds.size} selected contact${selectedLeadIds.size === 1 ? "" : "s"} as a list`}
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Saved audiences</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Click a list to edit its participants.</p>
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
              {lists.map(list => {
                const active = editingListId === list.id
                const loading = loadingListId === list.id
                return (
                  <div
                    key={list.id}
                    className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                      active
                        ? "border-orange-500/40 bg-orange-500/[0.07]"
                        : "border-border bg-card hover:border-orange-500/25 hover:bg-orange-500/[0.03]"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      onClick={() => loadListForEdit(list.id)}
                      disabled={loading}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{list.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {list.memberCount} contact{list.memberCount === 1 ? "" : "s"} · Created {new Date(list.createdAt).toLocaleDateString()}
                          {active ? " · Editing" : ""}
                        </p>
                      </div>
                      <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={deleteList.isPending}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (window.confirm(`Delete "${list.name}"? This cannot be undone.`)) deleteList.mutate(list.id)
                      }}
                      aria-label={`Delete ${list.name}`}
                    >
                      {deleteList.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <AddContactDialog
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        productId={productId}
        productName={product.name}
        onCreated={handleContactCreated}
      />
    </div>
  )
}
