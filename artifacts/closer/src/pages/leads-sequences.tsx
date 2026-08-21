/**
 * Email Sequences — SequenceManagerDialog + EnrollInSequenceDialog
 * Lets users build multi-step drip sequences (each step = an email with a delay_days offset),
 * reorder/insert/delete steps via drag-and-drop, and enroll leads.
 */
import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { RichTextEditor } from "@/components/RichTextEditor"
import {
  GripVertical, Plus, Trash2, Edit2, ChevronDown, ChevronRight,
  Mail, Calendar, Loader2, CheckCircle2, Users, AlertCircle,
  ArrowDownUp, X, Tag,
} from "lucide-react"
import { format, addDays } from "date-fns"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""
const VARS = ["{{firstName}}", "{{lastName}}", "{{company}}", "{{title}}", "{{email}}"]

// ── Types ─────────────────────────────────────────────────────────────────
export interface EmailSequence {
  id: number
  name: string
  description: string | null
  productId: number | null
  productName: string | null
  stepCount: number
  createdAt: string
}

export interface EmailSequenceStep {
  id: number
  sequenceId: number
  position: number
  delayDays: number
  name: string | null
  subject: string
  body: string
  createdAt: string
}

interface Lead {
  id: number
  firstName: string
  lastName: string
  email: string | null
}

// ── API helpers ─────────────────────────────────────────────────────────
const fetchSequences = async (productId?: number | null): Promise<EmailSequence[]> => {
  const url = productId
    ? `${BASE}/api/email-sequences?productId=${productId}`
    : `${BASE}/api/email-sequences`
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch sequences")
  return res.json()
}

const fetchUnassignedSequences = async (): Promise<EmailSequence[]> => {
  const res = await fetch(`${BASE}/api/email-sequences?unassigned=true`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch unassigned sequences")
  return res.json()
}

const fetchSteps = async (sequenceId: number): Promise<EmailSequenceStep[]> => {
  const res = await fetch(`${BASE}/api/email-sequences/${sequenceId}/steps`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch steps")
  return res.json()
}

// ── Sortable step row ────────────────────────────────────────────────────
function SortableStep({
  step,
  onEdit,
  onDelete,
  onInsertAfter,
}: {
  step: EmailSequenceStep
  onEdit: (step: EmailSequenceStep) => void
  onDelete: (step: EmailSequenceStep) => void
  onInsertAfter: (afterStep: EmailSequenceStep) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div className="group" ref={setNodeRef} style={style}>
      <div className={cn(
        "flex items-start gap-2 p-3 rounded-xl bg-muted/40 border border-border/20 transition-colors",
        isDragging && "shadow-2xl"
      )}>
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing p-0.5 shrink-0"
          type="button"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Step info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full shrink-0">
              Day {step.delayDays}
            </span>
            {step.name && (
              <span className="text-xs font-medium text-foreground truncate">{step.name}</span>
            )}
            <span className="text-xs text-muted-foreground truncate">{step.subject}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onEdit(step)}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Edit step"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(step)}
            className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
            title="Delete step"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Insert between button */}
      <div className="flex items-center justify-center h-5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onInsertAfter(step)}
          className="flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition-colors"
        >
          <Plus className="w-3 h-3" />
          insert step here
        </button>
      </div>
    </div>
  )
}

// ── Step edit form ────────────────────────────────────────────────────────
function StepForm({
  initial,
  onSave,
  onCancel,
  insertAfterDay,
}: {
  initial?: Partial<EmailSequenceStep>
  onSave: (data: Partial<EmailSequenceStep>) => void
  onCancel: () => void
  insertAfterDay?: number
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [delayDays, setDelayDays] = useState<number | "">(
    initial?.delayDays ?? (insertAfterDay !== undefined ? insertAfterDay + 1 : 0)
  )
  const [subject, setSubject] = useState(initial?.subject ?? "")
  const [body, setBody] = useState(initial?.body ?? "")

  const valid = subject.trim() && body.trim() && delayDays !== ""

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Step name (optional)</p>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Initial outreach"
            className="bg-muted/40 border-border/30"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Send on day</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={365}
              value={delayDays}
              onChange={e => setDelayDays(e.target.value === "" ? "" : parseInt(e.target.value))}
              className="bg-muted/40 border-border/30 text-center"
              placeholder="0"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">after enroll</span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Subject</p>
        <Input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Quick intro — {{company}}"
          className="bg-muted/40 border-border/30"
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Body</p>
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder={`Hi {{firstName}},\n\nI'm reaching out because…`}
          variables={VARS}
          minHeight={160}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 border-border/30" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1 bg-primary text-primary-foreground"
          disabled={!valid}
          onClick={() => onSave({
            name: name.trim() || undefined,
            delayDays: Number(delayDays),
            subject: subject.trim(),
            body: body.trim(),
          })}
        >
          Save step
        </Button>
      </div>
    </div>
  )
}

// ── Sequence detail (steps list with drag-drop) ───────────────────────────
function SequenceDetail({ sequence, onClose }: { sequence: EmailSequence; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [editingStep, setEditingStep] = useState<EmailSequenceStep | null | "new">(null)
  const [insertAfterStep, setInsertAfterStep] = useState<EmailSequenceStep | null>(null)

  const { data: steps = [], isLoading } = useQuery({
    queryKey: ["sequence-steps", sequence.id],
    queryFn: () => fetchSteps(sequence.id),
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderMut = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      const res = await fetch(`${BASE}/api/email-sequences/${sequence.id}/steps/reorder`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      })
      if (!res.ok) throw new Error("Reorder failed")
      return res.json()
    },
    onSuccess: (newSteps) => {
      qc.setQueryData(["sequence-steps", sequence.id], newSteps)
    },
    onError: () => toast({ title: "Failed to reorder steps", variant: "destructive" }),
  })

  const addStepMut = useMutation({
    mutationFn: async (data: Partial<EmailSequenceStep> & { position?: number }) => {
      const res = await fetch(`${BASE}/api/email-sequences/${sequence.id}/steps`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to add step")
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sequence-steps", sequence.id] })
      qc.invalidateQueries({ queryKey: ["email-sequences"] })
      setEditingStep(null)
      setInsertAfterStep(null)
      toast({ title: "Step added" })
    },
    onError: () => toast({ title: "Failed to add step", variant: "destructive" }),
  })

  const updateStepMut = useMutation({
    mutationFn: async ({ id, ...data }: Partial<EmailSequenceStep> & { id: number }) => {
      const res = await fetch(`${BASE}/api/email-sequences/${sequence.id}/steps/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update step")
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sequence-steps", sequence.id] })
      setEditingStep(null)
      toast({ title: "Step updated" })
    },
    onError: () => toast({ title: "Failed to update step", variant: "destructive" }),
  })

  const deleteStepMut = useMutation({
    mutationFn: async (stepId: number) => {
      await fetch(`${BASE}/api/email-sequences/${sequence.id}/steps/${stepId}`, {
        method: "DELETE", credentials: "include",
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sequence-steps", sequence.id] })
      qc.invalidateQueries({ queryKey: ["email-sequences"] })
      toast({ title: "Step deleted" })
    },
  })

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = steps.findIndex(s => s.id === active.id)
    const newIndex = steps.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = [...steps]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    reorderMut.mutate(reordered.map(s => s.id))
  }, [steps, reorderMut])

  // Determine the "insert after" position
  const insertAfterPosition = insertAfterStep ? insertAfterStep.position : null
  const insertAfterDay = insertAfterStep ? insertAfterStep.delayDays : undefined

  if (editingStep !== null || insertAfterStep !== null) {
    const isEditing = editingStep !== null && editingStep !== "new"
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => { setEditingStep(null); setInsertAfterStep(null) }} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
          <p className="text-sm font-medium text-foreground">
            {isEditing
              ? `Edit step ${(editingStep as EmailSequenceStep).position}`
              : insertAfterStep
              ? `Insert step after Day ${insertAfterStep.delayDays}`
              : "New step"
            }
          </p>
        </div>
        <StepForm
          initial={isEditing ? (editingStep as EmailSequenceStep) : undefined}
          insertAfterDay={insertAfterDay}
          onSave={data => {
            if (isEditing) {
              updateStepMut.mutate({ ...(editingStep as EmailSequenceStep), ...data })
            } else {
              addStepMut.mutate({
                ...data,
                position: insertAfterPosition !== null ? insertAfterPosition + 1 : undefined,
              })
            }
          }}
          onCancel={() => { setEditingStep(null); setInsertAfterStep(null) }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{sequence.name}</p>
          {sequence.description && (
            <p className="text-xs text-muted-foreground truncate">{sequence.description}</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : steps.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm space-y-3">
          <Mail className="w-8 h-8 mx-auto opacity-30" />
          <p>No steps yet. Add your first email.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div>
              {steps.map(step => (
                <SortableStep
                  key={step.id}
                  step={step}
                  onEdit={s => setEditingStep(s)}
                  onDelete={s => deleteStepMut.mutate(s.id)}
                  onInsertAfter={s => setInsertAfterStep(s)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Button
        className="w-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 gap-2"
        onClick={() => setEditingStep("new")}
      >
        <Plus className="w-4 h-4" />
        Add step
      </Button>
    </div>
  )
}

// ── Sequence list row ────────────────────────────────────────────────────
function SequenceRow({
  seq,
  onSelect,
  onDelete,
  showProductBadge,
}: {
  seq: EmailSequence
  onSelect: () => void
  onDelete: () => void
  showProductBadge?: boolean
}) {
  return (
    <div className="p-3 rounded-xl bg-muted/40 border border-border/20 flex items-start justify-between gap-2">
      <button onClick={onSelect} className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{seq.name}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 shrink-0">
            {seq.stepCount} {seq.stepCount === 1 ? "step" : "steps"}
          </span>
          {showProductBadge && seq.productName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-400/10 text-violet-400 shrink-0">
              {seq.productName}
            </span>
          )}
        </div>
        {seq.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{seq.description}</p>
        )}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onSelect} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Edit steps">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors" title="Delete sequence">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── SequenceManagerDialog ─────────────────────────────────────────────────
export function SequenceManagerDialog({
  open,
  onClose,
  productId,
}: {
  open: boolean
  onClose: () => void
  /** When set, sequences are scoped to this product so the whole team sees them. */
  productId?: number | null
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [selected, setSelected] = useState<EmailSequence | null>(null)

  const { data: sequences = [] } = useQuery({
    queryKey: ["email-sequences", productId ?? null],
    queryFn: () => fetchSequences(productId),
    enabled: open,
  })

  // When a product is active, also show sequences that haven't been assigned yet
  const { data: unassignedSequences = [] } = useQuery({
    queryKey: ["email-sequences-unassigned"],
    queryFn: fetchUnassignedSequences,
    enabled: open && productId != null,
  })

  const assignMut = useMutation({
    mutationFn: async (sequenceId: number) => {
      const res = await fetch(`${BASE}/api/email-sequences/${sequenceId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })
      if (!res.ok) throw new Error("Failed to assign sequence")
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-sequences", productId ?? null] })
      qc.invalidateQueries({ queryKey: ["email-sequences-unassigned"] })
      toast({ title: "Sequence assigned to this product" })
    },
    onError: () => toast({ title: "Failed to assign sequence", variant: "destructive" }),
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/email-sequences`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null, productId: productId ?? null }),
      })
      if (!res.ok) throw new Error("Failed to create sequence")
      return res.json() as Promise<EmailSequence>
    },
    onSuccess: (seq) => {
      qc.invalidateQueries({ queryKey: ["email-sequences", productId ?? null] })
      setCreating(false); setNewName(""); setNewDesc("")
      setSelected({ ...seq, stepCount: 0 })
      toast({ title: "Sequence created" })
    },
    onError: () => toast({ title: "Failed to create sequence", variant: "destructive" }),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/email-sequences/${id}`, { method: "DELETE", credentials: "include" })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-sequences", productId ?? null] })
      toast({ title: "Sequence deleted" })
    },
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <ArrowDownUp className="w-4 h-4 text-primary" />
            Email Sequences
          </DialogTitle>
        </DialogHeader>

        {selected ? (
          <SequenceDetail
            sequence={selected}
            onClose={() => setSelected(null)}
          />
        ) : creating ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">New sequence</p>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Name</p>
              <Input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMut.mutate() }}
                placeholder="Cold outreach sequence"
                className="bg-muted/40 border-border/30"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description (optional)</p>
              <Input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="5-touch sequence for enterprise prospects"
                className="bg-muted/40 border-border/30"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-border/30" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground"
                disabled={!newName.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              className="w-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 gap-2"
              onClick={() => setCreating(true)}
            >
              <Plus className="w-4 h-4" /> New Sequence
            </Button>

            {sequences.length === 0 && unassignedSequences.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <ArrowDownUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No sequences yet.</p>
                <p className="text-xs mt-1 opacity-60">Build a drip sequence and enroll leads to auto-schedule follow-ups.</p>
              </div>
            )}

            <div className="space-y-2">
              {sequences.map(seq => (
                <SequenceRow
                  key={seq.id}
                  seq={seq}
                  onSelect={() => setSelected(seq)}
                  onDelete={() => deleteMut.mutate(seq.id)}
                  showProductBadge={productId == null}
                />
              ))}
            </div>

            {/* Unassigned sequences — only visible when a product is active */}
            {productId != null && unassignedSequences.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2 px-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-400 font-medium">
                    {unassignedSequences.length} sequence{unassignedSequences.length !== 1 ? "s" : ""} not yet assigned to a product
                  </p>
                </div>
                {unassignedSequences.map(seq => (
                  <div
                    key={seq.id}
                    className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start justify-between gap-2"
                  >
                    <button onClick={() => setSelected(seq)} className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{seq.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 shrink-0">
                          {seq.stepCount} {seq.stepCount === 1 ? "step" : "steps"}
                        </span>
                      </div>
                      {seq.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{seq.description}</p>
                      )}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => assignMut.mutate(seq.id)}
                        disabled={assignMut.isPending}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                        title="Assign to this product"
                      >
                        {assignMut.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Tag className="w-3 h-3" />
                        )}
                        Assign
                      </button>
                      <button
                        onClick={() => { deleteMut.mutate(seq.id); qc.invalidateQueries({ queryKey: ["email-sequences-unassigned"] }) }}
                        className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete sequence"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── EnrollInSequenceDialog ────────────────────────────────────────────────
/**
 * Shown from the leads page when user wants to enroll selected leads in a sequence.
 */
export function EnrollInSequenceDialog({
  leads,
  open,
  onClose,
  onEnrolled,
  productId,
}: {
  leads: Lead[]
  open: boolean
  onClose: () => void
  onEnrolled?: (count: number) => void
  /** When set, only sequences for this product are shown. */
  productId?: number | null
}) {
  const { toast } = useToast()
  const [sequenceId, setSequenceId] = useState<number | null>(null)
  const [enrollDate, setEnrollDate] = useState(() => {
    const d = new Date()
    d.setSeconds(0, 0)
    return d.toISOString().slice(0, 16)
  })

  const { data: sequences = [] } = useQuery({
    queryKey: ["email-sequences", productId ?? null],
    queryFn: () => fetchSequences(productId),
    enabled: open,
  })

  const { data: steps = [] } = useQuery({
    queryKey: ["sequence-steps", sequenceId],
    queryFn: () => fetchSteps(sequenceId!),
    enabled: open && sequenceId !== null,
  })

  const leadsWithEmail = leads.filter(l => l.email)
  const noEmailCount = leads.length - leadsWithEmail.length

  const enrollMut = useMutation({
    mutationFn: async () => {
      if (!sequenceId) throw new Error("Select a sequence")
      const res = await fetch(`${BASE}/api/email-sequences/${sequenceId}/enroll`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: leadsWithEmail.map(l => l.id),
          enrollDate: new Date(enrollDate).toISOString(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error ?? "Enroll failed")
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast({
        title: `${data.enrolled} lead${data.enrolled !== 1 ? "s" : ""} enrolled`,
        description: `${data.scheduled} emails scheduled across ${data.stepsPerLead} steps`,
      })
      onEnrolled?.(data.enrolled)
      onClose()
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  })

  const baseDate = enrollDate ? new Date(enrollDate) : new Date()

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border/30 max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Enroll in Sequence
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lead summary */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <span>{leadsWithEmail.length} lead{leadsWithEmail.length !== 1 ? "s" : ""} will be enrolled</span>
            {noEmailCount > 0 && (
              <span className="text-amber-400">({noEmailCount} skipped — no email)</span>
            )}
          </div>

          {/* Sequence picker */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Choose sequence</p>
            {sequences.length === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border/20 text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4 shrink-0" />
                No sequences yet — create one in Email Sequences
              </div>
            ) : (
              <div className="space-y-1.5">
                {sequences.map(seq => (
                  <button
                    key={seq.id}
                    onClick={() => setSequenceId(seq.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition-all",
                      sequenceId === seq.id
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted/40 border-border/20 text-foreground hover:border-border/40"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{seq.name}</span>
                      {productId == null && seq.productName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-400/10 text-violet-400 shrink-0">
                          {seq.productName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{seq.stepCount} emails</span>
                    </div>
                    {seq.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{seq.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Start date */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Enrollment date (Day 0)</p>
            <input
              type="datetime-local"
              value={enrollDate}
              onChange={e => setEnrollDate(e.target.value)}
              className="w-full bg-muted/40 border border-border/30 rounded-xl px-3 py-2 text-sm text-foreground"
            />
          </div>

          {/* Schedule preview */}
          {sequenceId && steps.length > 0 && (
            <div className="rounded-xl bg-muted/20 border border-border/20 p-3 space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Schedule preview
              </p>
              <div className="space-y-1.5">
                {steps.map(step => (
                  <div key={step.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                      Day {step.delayDays}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {format(addDays(baseDate, step.delayDays), "EEE d MMM")}
                    </span>
                    <span className="text-foreground truncate">{step.subject}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            className="w-full bg-primary text-primary-foreground gap-2"
            disabled={!sequenceId || leadsWithEmail.length === 0 || enrollMut.isPending}
            onClick={() => enrollMut.mutate()}
          >
            {enrollMut.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling…</>
              : <><Users className="w-4 h-4" /> Enroll {leadsWithEmail.length} lead{leadsWithEmail.length !== 1 ? "s" : ""}</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
