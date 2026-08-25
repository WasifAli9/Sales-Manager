import { useVisionData, useVisionMutations } from "@/hooks/use-vision"
import { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Heart, Compass, Mountain,
  Sparkles, Plus, Trash2, Loader2,
  Image as ImageIcon, X, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { VisionItem } from "@workspace/api-client-react"

// ── image helpers ─────────────────────────────────────────────────────────
/** Compress an image file to a JPEG data URI (max 1200px wide, quality 0.82). */
async function compressToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const MAX_W = 900   // keeps base64 well under 500 KB
      const scale = img.width > MAX_W ? MAX_W / img.width : 1
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas not available")); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL("image/jpeg", 0.72))
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")) }
    img.src = objectUrl
  })
}

// ── kind config ────────────────────────────────────────────────────────────
const KIND_OPTIONS = [
  { id: "image",      label: "Photo",       icon: ImageIcon, desc: "An inspiring image with caption" },
  { id: "north_star", label: "North Star",  icon: Compass,   desc: "Your ultimate vision or mission" },
  { id: "milestone",  label: "Milestone",   icon: Mountain,  desc: "A big goal or revenue target" },
  { id: "charity",    label: "Give Back",   icon: Heart,     desc: "A giving or impact commitment" },
] as const

type KindId = (typeof KIND_OPTIONS)[number]["id"]


// ── add / edit dialog ──────────────────────────────────────────────────────
function VisionItemDialog({
  open,
  onClose,
  existing,
}: {
  open: boolean
  onClose: () => void
  existing?: VisionItem
}) {
  const { createVisionItem, updateVisionItem, deleteVisionItem } = useVisionMutations()
  const fileRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<KindId>((existing?.kind as KindId) ?? "image")
  const [title, setTitle] = useState(existing?.title ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [targetValue, setTargetValue] = useState(existing?.targetValue != null ? String(existing.targetValue) : "")
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? "")
  // imageUrl is now a data URI — use directly as src
  const [previewSrc, setPreviewSrc] = useState(existing?.imageUrl ?? "")
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (open) {
      setKind((existing?.kind as KindId) ?? "image")
      setTitle(existing?.title ?? "")
      setDescription(existing?.description ?? "")
      setTargetValue(existing?.targetValue != null ? String(existing.targetValue) : "")
      setImageUrl(existing?.imageUrl ?? "")
      setPreviewSrc(existing?.imageUrl ?? "")
      setError(null)
      setConfirmDelete(false)
    }
  }, [open, existing?.id])

  const loadImageFile = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const dataUri = await compressToDataUri(file)
      setImageUrl(dataUri)
      setPreviewSrc(dataUri)
      // Auto-switch to Photo type when an image is pasted/dropped
      setKind("image")
    } catch {
      setError("Photo failed to load — try another image")
    } finally {
      setUploading(false)
    }
  }

  // Paste listener — active while the dialog is open
  useEffect(() => {
    if (!open) return
    const handler = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imageItem = items.find(it => it.type.startsWith("image/"))
      if (!imageItem) return
      const file = imageItem.getAsFile()
      if (file) {
        e.preventDefault()
        loadImageFile(file)
      }
    }
    document.addEventListener("paste", handler)
    return () => document.removeEventListener("paste", handler)
  }, [open])

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    loadImageFile(file)
  }

  const handleSave = async () => {
    if (!title.trim()) { setError("Title is required"); return }
    if (kind === "image" && !imageUrl) { setError("Please add a photo"); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        kind,
        title: title.trim(),
        description: description.trim() || undefined,
        targetValue: targetValue ? parseFloat(targetValue) : undefined,
        imageUrl: imageUrl || undefined,
        sortOrder: existing?.sortOrder ?? 0,
      }
      if (existing) {
        await updateVisionItem.mutateAsync({ id: existing.id, data: payload })
      } else {
        await createVisionItem.mutateAsync({ data: payload })
      }
      onClose()
    } catch {
      setError("Failed to save — please try again")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!existing) return
    setDeleting(true)
    try {
      await deleteVisionItem.mutateAsync({ id: existing.id })
      onClose()
    } catch {
      setError("Failed to delete")
    } finally {
      setDeleting(false)
    }
  }

  const showTarget = kind === "milestone" || kind === "charity"
  const showPhoto = kind === "image"

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit vision item" : "Add to vision board"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Kind selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map(k => {
                const Icon = k.icon
                return (
                  <button
                    key={k.id}
                    onClick={() => setKind(k.id)}
                    className={cn(
                      "flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors",
                      kind === k.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:border-border/80 hover:bg-muted/30"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", kind === k.id ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className={cn("text-xs font-semibold", kind === k.id ? "text-primary" : "text-foreground")}>{k.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{k.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Photo upload */}
          {showPhoto && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Photo *</label>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className={cn(
                  "w-full rounded-2xl border-2 border-dashed transition-colors overflow-hidden relative",
                  previewSrc ? "border-primary/30 h-48" : "border-border hover:border-primary/40 h-32 flex items-center justify-center"
                )}
              >
                {previewSrc ? (
                  <>
                    <img src={previewSrc} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white text-sm font-medium flex items-center gap-2">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                        {uploading ? "Uploading…" : "Change photo"}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageIcon className="w-6 h-6" />}
                    <span className="text-sm">{uploading ? "Processing…" : "Tap to choose a photo"}</span>
                    {!uploading && (
                      <span className="text-[10px] text-muted-foreground/50">or paste an image (⌘V / Ctrl+V)</span>
                    )}
                  </div>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={
                kind === "north_star" ? "e.g. Build something people love"
                : kind === "milestone" ? "e.g. First £10k MRR"
                : kind === "charity" ? "e.g. Sponsor 100 students"
                : "e.g. Dream home in the countryside"
              }
              className="h-11 rounded-xl"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Description <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this mean to you?"
              className="rounded-xl resize-none min-h-[72px] text-sm"
            />
          </div>

          {/* Target value */}
          {showTarget && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {kind === "charity" ? "Giving commitment (£)" : "Revenue target (£)"}
                <span className="text-muted-foreground/50 ml-1">(optional)</span>
              </label>
              <Input
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                type="number"
                min="0"
                placeholder="e.g. 10000"
                className="h-11 rounded-xl"
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} className="h-11 rounded-xl px-4">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || uploading} className="flex-1 h-11 rounded-xl gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {existing ? "Save changes" : "Add to vision"}
            </Button>
          </div>

          {existing && (
            <div className="pt-1 border-t border-border">
              {confirmDelete ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 h-9 rounded-xl text-xs"
                    onClick={() => setConfirmDelete(false)}>Keep it</Button>
                  <Button variant="destructive" size="sm" className="flex-1 h-9 rounded-xl text-xs gap-1.5"
                    disabled={deleting} onClick={handleDelete}>
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Yes, delete
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-destructive/60 hover:text-destructive transition-colors w-full justify-center py-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete this item
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── tile components ────────────────────────────────────────────────────────

function PhotoTile({ item, onClick }: { item: VisionItem; onClick: () => void }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-2xl aspect-[3/4] bg-card border border-border shadow-sm active:scale-95 transition-transform"
    >
      {item.imageUrl ? (
        <>
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            draggable={false}
            onError={e => {
              // Old object-storage paths 404 — hide the broken img, show placeholder
              const t = e.currentTarget
              t.style.display = "none"
              t.nextElementSibling?.classList.remove("hidden")
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          {/* Fallback shown if image URL fails to load */}
          <div className="hidden w-full h-full bg-muted/50 absolute inset-0 flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-muted/50 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white text-sm font-bold leading-tight line-clamp-2">{item.title}</p>
        {item.description && (
          <p className="text-white/60 text-[10px] mt-1 line-clamp-1">{item.description}</p>
        )}
      </div>
      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/30 backdrop-blur flex items-center justify-center">
        <Pencil className="w-3 h-3 text-white/70" />
      </div>
    </motion.button>
  )
}

function NorthStarTile({ item, onClick }: { item: VisionItem; onClick: () => void }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      onClick={onClick}
      className="relative w-full col-span-2 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent border border-primary/20 p-4 text-left active:scale-[0.98] transition-transform shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 ring-2 ring-primary/20">
          <Compass className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary/60 mb-1">North Star</p>
          <p className="text-sm font-bold text-foreground leading-snug">{item.title}</p>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
              {item.description}
            </p>
          )}
        </div>
        <Pencil className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-1" />
      </div>
    </motion.button>
  )
}

function MilestoneTile({ item, onClick }: { item: VisionItem; onClick: () => void }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-warn/20 via-warn/8 to-transparent border border-warn/20 p-4 text-left active:scale-[0.98] transition-transform shadow-sm flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-warn/20 flex items-center justify-center shrink-0">
          <Mountain className="w-4 h-4 text-warn" />
        </div>
        <Pencil className="w-3 h-3 text-muted-foreground/30 ml-auto shrink-0" />
      </div>
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-warn/60">Milestone</p>
      <p className="text-xs font-bold text-foreground leading-snug line-clamp-2">{item.title}</p>
      {item.targetValue != null && (
        <div className="mt-auto pt-1">
          <p className="text-warn font-bold text-base">£{Number(item.targetValue).toLocaleString()}</p>
          <p className="text-[9px] text-warn/50">Target</p>
        </div>
      )}
    </motion.button>
  )
}

function CharityTile({ item, onClick }: { item: VisionItem; onClick: () => void }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-success/20 via-success/8 to-transparent border border-success/20 p-4 text-left active:scale-[0.98] transition-transform shadow-sm flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center shrink-0">
          <Heart className="w-4 h-4 text-success fill-success/30" />
        </div>
        <Pencil className="w-3 h-3 text-muted-foreground/30 ml-auto shrink-0" />
      </div>
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-success/60">Give Back</p>
      <p className="text-xs font-bold text-foreground leading-snug line-clamp-2">{item.title}</p>
      {item.targetValue != null && (
        <div className="mt-auto pt-1">
          <p className="text-success font-bold text-base">£{Number(item.targetValue).toLocaleString()}</p>
          <p className="text-[9px] text-success/50">Commitment</p>
        </div>
      )}
    </motion.button>
  )
}

// ── main page ──────────────────────────────────────────────────────────────
export default function VisionPage() {
  const { items } = useVisionData()
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<VisionItem | null>(null)

  const allItems = items.data ?? []

  // Sort: north_star first, then milestone/charity, then images
  const sorted = allItems.slice().sort((a, b) => {
    const order: Record<string, number> = { north_star: 0, milestone: 1, charity: 2, image: 3 }
    return (order[a.kind] ?? 4) - (order[b.kind] ?? 4)
  })

  if (items.isLoading) {
    return (
      <div className="flex-1 p-4 pb-24 lg:pb-10">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {[1,2,3,4].map(i => (
            <div key={i} className={cn("bg-muted animate-pulse rounded-2xl", i === 1 ? "col-span-2 h-24" : "aspect-[3/4]")} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Vision Board</h1>
          {allItems.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{allItems.length} item{allItems.length !== 1 ? "s" : ""}</p>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4">
        {allItems.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center ring-4 ring-primary/10">
              <Sparkles className="w-10 h-10 text-primary/60" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1">Build your vision board</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px]">
                Add photos, your north star, milestones, and giving goals — see them all here at a glance.
              </p>
            </div>
            <Button onClick={() => setShowAdd(true)} className="gap-2 rounded-xl h-11 px-6">
              <Plus className="w-4 h-4" />
              Add your first item
            </Button>
          </div>
        ) : (
          /* Tile grid */
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
            <AnimatePresence>
              {sorted.map(item => {
                if (item.kind === "north_star") {
                  return (
                    <NorthStarTile key={item.id} item={item} onClick={() => setEditItem(item)} />
                  )
                }
                if (item.kind === "milestone") {
                  return (
                    <MilestoneTile key={item.id} item={item} onClick={() => setEditItem(item)} />
                  )
                }
                if (item.kind === "charity") {
                  return (
                    <CharityTile key={item.id} item={item} onClick={() => setEditItem(item)} />
                  )
                }
                // image
                return (
                  <PhotoTile key={item.id} item={item} onClick={() => setEditItem(item)} />
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <VisionItemDialog open={showAdd} onClose={() => setShowAdd(false)} />
      <VisionItemDialog
        open={!!editItem}
        onClose={() => setEditItem(null)}
        existing={editItem ?? undefined}
      />
    </div>
  )
}
