import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export type LeadTag = {
  id: number
  name: string
  leadCount?: number
}

export function TagPicker({
  value,
  onChange,
  label = "Tags",
  allowCreate = true,
}: {
  value: number[]
  onChange: (tagIds: number[]) => void
  label?: string
  allowCreate?: boolean
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const { data: tags = [] } = useQuery<LeadTag[]>({
    queryKey: ["lead-tags"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lead-tags`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load tags")
      return res.json()
    },
  })
  const selected = tags.filter(tag => value.includes(tag.id))
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter(tagId => tagId !== id) : [...value, id])
  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`${BASE}/api/lead-tags`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      })
      const tag = await res.json()
      if (!res.ok) throw new Error(tag.error || "Could not create tag")
      await qc.invalidateQueries({ queryKey: ["lead-tags"] })
      if (!value.includes(tag.id)) onChange([...value, tag.id])
      setNewName("")
    } catch (error) {
      toast({ title: "Could not create tag", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(tag => (
            <button key={tag.id} type="button" onClick={() => toggle(tag.id)} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20">
              {tag.name}<X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.filter(tag => !value.includes(tag.id)).map(tag => (
            <button key={tag.id} type="button" onClick={() => toggle(tag.id)} className="rounded-full border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary">
              + {tag.name}
            </button>
          ))}
        </div>
      )}
      {allowCreate && (
        <div className="flex gap-2">
          <Input value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); create() } }} placeholder="Create a new tag…" maxLength={64} className="h-8 bg-muted/40 text-xs" />
          <Button type="button" size="sm" variant="outline" onClick={create} disabled={creating || !newName.trim()} className="h-8 px-2 text-xs">
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
          </Button>
        </div>
      )}
    </div>
  )
}
