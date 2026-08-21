import { Link, useParams } from "wouter"
import { useProductDetail } from "@/hooks/use-products"
import { useProductDetailData, useProductDetailMutations } from "@/hooks/use-product-detail"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Mail, Pencil, Save, Loader2, ExternalLink, Sparkles, Plus, Trash2, ArrowUp, ArrowDown, Rocket, CalendarDays, Tags, ArrowRight, ListChecks } from "lucide-react"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import { getGetProductQueryKey, useUpdateProduct } from "@workspace/api-client-react"
import { useAuth } from "@/hooks/use-auth"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { RichTextEditor } from "@/components/RichTextEditor"
import { useToast } from "@/hooks/use-toast"

export default function ProductSectionEmail() {
  const params = useParams()
  const id = Number(params.id)
  const { data: product, isLoading: prodLoad } = useProductDetail(id)
  const { platformStates } = useProductDetailData(id)

  if (prodLoad || platformStates.isLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-4 w-56 bg-muted rounded" />
        <div className="h-32 bg-muted rounded-2xl" />
        <div className="h-32 bg-muted rounded-2xl" />
      </div>
    )
  }

  if (!product) return <div className="p-4 text-muted-foreground">Product not found</div>

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-6 px-4">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Portfolio", href: "/products" },
          { label: product.name, href: `/products/${id}` },
          { label: "Email Settings" },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Mail className="w-5 h-5 text-orange-400" />
          Email Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure the sender identity, signature, and required unsubscribe footer for this product's outbound emails.
        </p>
      </div>

      {/* Email Identity */}
      <EmailIdentitySection product={product} productId={id} />

      {/* Email Signature */}
      <EmailSignatureSection product={product} productId={id} />

       {/* Unsubscribe footer */}
       <UnsubscribeFooterSection product={product} productId={id} />

        <EmailWorkspaceHub productId={id} />

      {/* Platform Readiness */}
      {platformStates.data && platformStates.data.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Platform Readiness
          </h2>
          <div className="space-y-2">
            {platformStates.data.map(ps => (
              <div
                key={ps.id}
                className="flex justify-between items-center bg-card p-3 rounded-xl border border-border"
              >
                <span className="font-medium capitalize text-sm">{ps.platform}</span>
                <Badge variant="outline" className="bg-background text-[10px] uppercase">
                  {ps.stage.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type SequenceStepDraft = {
  name: string
  delayDays: number
  subject: string
  body: string
}

type SequenceDraft = {
  sequenceId?: number
  name: string
  description: string
  steps: SequenceStepDraft[]
}

interface SavedSequence {
  id: number
  name: string
  description: string | null
  stepCount: number
}

interface ContactListOption {
  id: number
  name: string
  memberCount: number
}

interface LeadTagOption {
  id: number
  name: string
  leadCount: number
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""
const MERGE_FIELDS = ["{{firstName}}", "{{lastName}}", "{{company}}", "{{title}}", "{{email}}"]

function blankStep(delayDays = 0): SequenceStepDraft {
  return { name: "", delayDays, subject: "", body: "" }
}

function EmailWorkspaceHub({ productId }: { productId: number }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Outbound workspace</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Build reusable sequences and audiences in focused, full-page workspaces.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Link href={`/products/${productId}/email/sequences`} className="group">
          <div className="flex min-h-[132px] items-start gap-4 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4 transition-colors hover:border-violet-400/40 hover:bg-violet-500/[0.08]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Email sequences</h3>
                <ArrowRight className="h-4 w-4 shrink-0 text-violet-400 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Draft AI-assisted templates, refine every email, and launch campaigns without squeezing the editor into settings.
              </p>
            </div>
          </div>
        </Link>

        <Link href={`/products/${productId}/email/lists`} className="group">
          <div className="flex min-h-[132px] items-start gap-4 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-4 transition-colors hover:border-orange-400/40 hover:bg-orange-500/[0.08]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
              <ListChecks className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Contact lists</h3>
                <ArrowRight className="h-4 w-4 shrink-0 text-orange-400 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Create named, reusable campaign audiences from this product’s visible leads in one clear screen.
              </p>
            </div>
          </div>
        </Link>
      </div>
    </section>
  )
}

export function ProductSequenceWorkspace({
  product,
  productId,
  initialSequenceId,
}: {
  product: any
  productId: number
  initialSequenceId?: number
}) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [instruction, setInstruction] = useState("")
  const [savingInstruction, setSavingInstruction] = useState(false)
  const [emailCount, setEmailCount] = useState(3)
  const [gaps, setGaps] = useState<number[]>([3, 4])
  const [draft, setDraft] = useState<SequenceDraft>({ name: "", description: "", steps: [] })
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationPhase, setGenerationPhase] = useState("")
  const [generationCompleteVisible, setGenerationCompleteVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedSequenceId, setSelectedSequenceId] = useState("")
  const [campaignName, setCampaignName] = useState("")
  const [campaignListId, setCampaignListId] = useState("")
  const [campaignAudience, setCampaignAudience] = useState<"list" | "tags">("list")
  const [campaignTagIds, setCampaignTagIds] = useState<number[]>([])
  const [campaignTagMatch, setCampaignTagMatch] = useState<"any" | "all">("any")
  const [campaignStartAt, setCampaignStartAt] = useState(() => {
    const date = new Date()
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset() + 10)
    return date.toISOString().slice(0, 16)
  })
  const [launching, setLaunching] = useState(false)

  const sequencesQuery = useQuery({
    queryKey: ["product-email-sequences", productId],
    queryFn: async (): Promise<SavedSequence[]> => {
      const res = await fetch(`${BASE}/api/email-sequences?productId=${productId}`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load sequences")
      return res.json()
    },
  })
  const contactListsQuery = useQuery({
    queryKey: ["contact-lists", productId],
    queryFn: async (): Promise<ContactListOption[]> => {
      const res = await fetch(`${BASE}/api/contact-lists?productId=${productId}`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load contact lists")
      return res.json()
    },
  })
  const leadTagsQuery = useQuery({
    queryKey: ["lead-tags"],
    queryFn: async (): Promise<LeadTagOption[]> => {
      const res = await fetch(`${BASE}/api/lead-tags?productId=${productId}`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load tags")
      return res.json()
    },
  })
  const instructionQuery = useQuery({
    queryKey: ["product-email-sequence-instruction", productId],
    queryFn: async (): Promise<{ instruction: string }> => {
      const res = await fetch(`${BASE}/api/products/${productId}/email-sequence-settings`, { credentials: "include" })
      if (!res.ok) throw new Error("Could not load the product brief")
      return res.json()
    },
  })

  useEffect(() => {
    setGaps(previous => Array.from({ length: Math.max(0, emailCount - 1) }, (_, index) => previous[index] ?? 3))
  }, [emailCount])
  useEffect(() => {
    if (instructionQuery.data) setInstruction(instructionQuery.data.instruction)
  }, [instructionQuery.data])

  useEffect(() => {
    if (!generating) return

    const startedAt = Date.now()
    const stages = [
      { after: 0, progress: 8, label: "Saving your product brief…" },
      { after: 700, progress: 28, label: "Writing subject lines for each email…" },
      { after: 1800, progress: 56, label: "Drafting the email bodies and cadence…" },
      { after: 3600, progress: 84, label: "Preparing your editable sequence preview…" },
    ]

    const updateProgress = () => {
      const elapsed = Date.now() - startedAt
      const stage = [...stages].reverse().find(item => elapsed >= item.after) ?? stages[0]
      const nextStage = stages.find(item => item.after > elapsed)
      const stageSpan = nextStage ? nextStage.after - stage.after : 9000
      const stageProgress = nextStage ? Math.min(10, Math.floor(((elapsed - stage.after) / stageSpan) * 10)) : Math.min(8, Math.floor((elapsed - stage.after) / 1400))
      setGenerationPhase(stage.label)
      setGenerationProgress(Math.min(92, stage.progress + stageProgress))
    }

    updateProgress()
    const timer = window.setInterval(updateProgress, 250)
    return () => window.clearInterval(timer)
  }, [generating])

  const updateDraftStep = (index: number, patch: Partial<SequenceStepDraft>) => {
    setDraft(current => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step),
    }))
  }

  const setGapAfter = (index: number, waitDays: number) => {
    setDraft(current => {
      const waits = current.steps.slice(1).map((step, stepIndex) => step.delayDays - current.steps[stepIndex].delayDays)
      waits[index] = Math.max(0, waitDays)
      let day = 0
      return {
        ...current,
        steps: current.steps.map((step, stepIndex) => {
          if (stepIndex > 0) day += waits[stepIndex - 1] ?? 0
          return { ...step, delayDays: day }
        }),
      }
    })
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= draft.steps.length) return
    const steps = [...draft.steps]
    ;[steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]]
    const waits = draft.steps.slice(1).map((step, stepIndex) => step.delayDays - draft.steps[stepIndex].delayDays)
    let day = 0
    setDraft({ ...draft, steps: steps.map((step, stepIndex) => {
      if (stepIndex > 0) day += waits[stepIndex - 1] ?? 3
      return { ...step, delayDays: day }
    }) })
  }

  const removeStep = (index: number) => {
    if (draft.steps.length <= 1) return
    const remaining = draft.steps.filter((_, stepIndex) => stepIndex !== index)
    const firstDay = remaining[0]?.delayDays ?? 0
    setDraft({
      ...draft,
      steps: remaining.map(step => ({
        ...step,
        delayDays: Math.max(0, step.delayDays - firstDay),
      })),
    })
  }

  const generate = async () => {
    if (instruction.trim().length < 5) {
      toast({ title: "Add a little more direction", description: "Tell the AI what this sequence should achieve.", variant: "destructive" })
      return
    }
    setGenerating(true)
    setGenerationCompleteVisible(false)
    try {
      await saveInstruction()
      const res = await fetch(`${BASE}/api/email-sequences/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, instruction, emailCount, delaysBetweenEmails: gaps }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Could not generate a sequence")
      setDraft({ name: result.name, description: result.description ?? "", steps: result.steps })
      setGenerationProgress(100)
      setGenerationPhase(`Preview ready — ${result.steps.length} email${result.steps.length === 1 ? "" : "s"} to review`)
      setGenerationCompleteVisible(true)
      toast({ title: "Sequence draft ready", description: "Review every email, subject, and cadence before saving." })
    } catch (error) {
      toast({ title: "Generation failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setGenerating(false)
    }
  }

  const saveInstruction = async () => {
    setSavingInstruction(true)
    try {
      const res = await fetch(`${BASE}/api/products/${productId}/email-sequence-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Could not save product brief")
      await qc.invalidateQueries({ queryKey: ["product-email-sequence-instruction", productId] })
      toast({ title: "Product brief saved" })
    } catch (error) {
      toast({ title: "Could not save product brief", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
      throw error
    } finally {
      setSavingInstruction(false)
    }
  }

  const saveSequence = async () => {
    if (!draft.name.trim() || !draft.steps.length || draft.steps.some(step => !step.subject.trim() || !step.body.trim())) {
      toast({ title: "Finish the sequence first", description: "Every email needs a subject and body.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`${BASE}/api/email-sequences/save`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequenceId: draft.sequenceId,
          name: draft.name,
          description: draft.description || null,
          productId,
          steps: draft.steps,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Could not save sequence")
      setDraft(current => ({ ...current, sequenceId: result.sequence.id }))
      setSelectedSequenceId(String(result.sequence.id))
      setCampaignName(current => current || `${result.sequence.name} launch`)
      await qc.invalidateQueries({ queryKey: ["product-email-sequences", productId] })
      toast({ title: "Sequence saved", description: "The entire sequence and its emails were saved together." })
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const loadSequence = async (id: string) => {
    setSelectedSequenceId(id)
    if (!id) return
    try {
      const [sequence, steps] = await Promise.all([
        (sequencesQuery.data ?? []).find(item => item.id === Number(id)),
        fetch(`${BASE}/api/email-sequences/${id}/steps`, { credentials: "include" }).then(res => {
          if (!res.ok) throw new Error("Could not load sequence emails")
          return res.json() as Promise<SequenceStepDraft[]>
        }),
      ])
      if (!sequence) return
      setDraft({
        sequenceId: sequence.id,
        name: sequence.name,
        description: sequence.description ?? "",
        steps: steps.map(step => ({ name: step.name ?? "", delayDays: step.delayDays, subject: step.subject, body: step.body })),
      })
      setCampaignName(`${sequence.name} launch`)
    } catch {
      toast({ title: "Could not open that sequence", variant: "destructive" })
    }
  }

  useEffect(() => {
    if (!initialSequenceId || selectedSequenceId || !sequencesQuery.data?.some(sequence => sequence.id === initialSequenceId)) return
    void loadSequence(String(initialSequenceId))
  }, [initialSequenceId, selectedSequenceId, sequencesQuery.data])

  const launch = async () => {
    const sequenceId = Number(selectedSequenceId || draft.sequenceId)
    const hasAudience = campaignAudience === "list" ? !!campaignListId : campaignTagIds.length > 0
    if (!sequenceId || !campaignName.trim() || !hasAudience || !campaignStartAt) {
      toast({ title: "Choose a saved sequence, audience, name, and start time", variant: "destructive" })
      return
    }
    setLaunching(true)
    try {
      const res = await fetch(`${BASE}/api/email-sequences/${sequenceId}/launch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(campaignAudience === "list"
            ? { contactListId: Number(campaignListId) }
            : { tagIds: campaignTagIds, tagMatch: campaignTagMatch }),
          name: campaignName,
          startAt: new Date(campaignStartAt).toISOString(),
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Could not launch campaign")
      toast({ title: "Campaign scheduled", description: `${result.scheduled} email${result.scheduled === 1 ? "" : "s"} are queued for ${result.enrolled} contacts.` })
      setCampaignName("")
      await qc.invalidateQueries({ queryKey: ["email-campaigns"] })
    } catch (error) {
      toast({ title: "Campaign launch failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setLaunching(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">AI Email Sequences</h2>
          <p className="text-xs text-muted-foreground mt-1">Create a product-specific outreach sequence, refine every detail, and save it in one step.</p>
        </div>
        <Sparkles className="w-5 h-5 text-violet-400 shrink-0" />
      </div>

      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">What should this sequence say?</label>
          <Textarea
            value={instruction}
            onChange={event => setInstruction(event.target.value)}
            rows={9}
            placeholder={`For example: Start a thoughtful conversation with ${product.name}'s ideal customers. Lead with their likely challenge, show a practical outcome, and make the final email a gentle break-up.`}
            className="min-h-[190px] resize-y rounded-xl bg-background/70 text-sm leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">The AI uses this brief, plus this product’s positioning, customer profile, and value proposition.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Number of emails</label>
            <Input type="number" min={1} max={10} value={emailCount} onChange={event => setEmailCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} className="bg-background/70" />
          </div>
          {emailCount > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Wait between emails</label>
              <div className="flex flex-wrap gap-2">
                {gaps.map((gap, index) => (
                  <label key={index} className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-background/70 px-2 py-1.5 text-xs">
                    After #{index + 1}
                    <Input type="number" min={0} max={365} value={gap} onChange={event => setGaps(current => current.map((item, itemIndex) => itemIndex === index ? Math.max(0, Number(event.target.value) || 0) : item))} className="h-7 w-14 px-1 text-center" />
                    days
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
          <div className="flex flex-wrap gap-2">
          <Button onClick={saveInstruction} disabled={savingInstruction} variant="outline" className="w-full sm:w-auto gap-2">
            {savingInstruction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save product brief
          </Button>
           <Button onClick={generate} disabled={generating || savingInstruction} className="w-full sm:w-auto gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate editable sequence
          </Button>
          </div>
        {(generating || generationCompleteVisible) && (
          <div
            className="space-y-2 rounded-xl border border-violet-500/20 bg-background/60 px-3 py-3"
            role="status"
            aria-live="polite"
            aria-label="AI sequence generation progress"
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                {generating ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-400" /> : <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" />}
                <span className="truncate">{generationPhase}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{generationProgress}%</span>
            </div>
            <Progress value={generationProgress} className="h-2 bg-violet-500/10 [&>div]:bg-violet-400" />
            <p className="text-[11px] text-muted-foreground">
              {generating
                ? `Building ${emailCount} email${emailCount === 1 ? "" : "s"} with subject lines and a reviewable preview.`
                : "Your editable sequence preview is ready below."}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDraft({ name: "", description: "", steps: [blankStep()] })} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Start manually
        </Button>
        {(sequencesQuery.data?.length ?? 0) > 0 && (
          <select value={selectedSequenceId} onChange={event => loadSequence(event.target.value)} className="h-9 max-w-[260px] rounded-lg border border-input bg-background px-3 text-xs">
            <option value="">Open a saved sequence…</option>
            {sequencesQuery.data?.map(sequence => <option key={sequence.id} value={sequence.id}>{sequence.name} · {sequence.stepCount} emails</option>)}
          </select>
        )}
      </div>

      {draft.steps.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Sequence name</label>
              <Input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Q4 intro sequence" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Internal description</label>
              <Input value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Who this sequence is for" />
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Schedule preview: {draft.steps.map((step, index) => `Email ${index + 1}: Day ${step.delayDays}`).join(" · ")}
          </div>
          {draft.steps.map((step, index) => (
            <div key={`${index}-${step.delayDays}`} className="rounded-xl border border-border/50 bg-muted/15 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Email {index + 1} · Day {step.delayDays}</span>
                  <Input value={step.name} onChange={event => updateDraftStep(index, { name: event.target.value })} placeholder="Optional email name" className="h-8 w-48 text-xs" />
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={draft.steps.length === 1}
                    onClick={() => removeStep(index)}
                    title="Delete this email and rebase the remaining schedule"
                    aria-label={`Delete email ${index + 1}`}
                    className="text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <Input value={step.subject} onChange={event => updateDraftStep(index, { subject: event.target.value })} placeholder="Email subject" className="bg-background" />
              <RichTextEditor value={step.body} onChange={body => updateDraftStep(index, { body })} variables={MERGE_FIELDS} minHeight={230} placeholder={`Hi {{firstName}},\n\n`} />
              {index < draft.steps.length - 1 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Wait after this email
                  <Input type="number" min={0} max={365} value={draft.steps[index + 1].delayDays - step.delayDays} onChange={event => setGapAfter(index, Number(event.target.value) || 0)} className="h-8 w-20 text-center" />
                  days before email {index + 2}
                </label>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDraft({ ...draft, steps: [...draft.steps, blankStep((draft.steps.at(-1)?.delayDays ?? 0) + 3)] })} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add email
            </Button>
            <Button onClick={saveSequence} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save entire sequence
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
        <div className="flex gap-2">
          <Rocket className="w-5 h-5 text-primary shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">Launch a saved sequence</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Choose a saved list or tag audience and start date. Recipients and emails are snapshotted, so later edits won’t affect this campaign.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={campaignName} onChange={event => setCampaignName(event.target.value)} placeholder="Campaign name" />
          <div className="flex rounded-lg border border-input bg-background p-1">
            {(["list", "tags"] as const).map(audience => (
              <button key={audience} type="button" onClick={() => setCampaignAudience(audience)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${campaignAudience === audience ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                {audience === "list" ? "Saved list" : "Tags"}
              </button>
            ))}
          </div>
          {campaignAudience === "list" ? (
            <select value={campaignListId} onChange={event => setCampaignListId(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
              <option value="">Choose a contact list…</option>
              {contactListsQuery.data?.map(list => <option key={list.id} value={list.id}>{list.name} · {list.memberCount} contacts</option>)}
            </select>
          ) : (
            <div className="rounded-lg border border-input bg-background p-2 sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Tags className="w-3.5 h-3.5" /> Select audience tags</span>
                {campaignTagIds.length > 1 && (
                  <div className="flex rounded border border-border/30 p-0.5">
                    {(["any", "all"] as const).map(match => <button key={match} onClick={() => setCampaignTagMatch(match)} className={`rounded px-2 py-0.5 text-[10px] capitalize ${campaignTagMatch === match ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>{match}</button>)}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {leadTagsQuery.data?.map(tag => {
                  const selected = campaignTagIds.includes(tag.id)
                  return <button key={tag.id} type="button" onClick={() => setCampaignTagIds(ids => selected ? ids.filter(id => id !== tag.id) : [...ids, tag.id])} className={`rounded-full border px-2 py-1 text-[11px] ${selected ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground"}`}>{tag.name}{tag.leadCount ? ` · ${tag.leadCount}` : ""}</button>
                })}
                {!leadTagsQuery.data?.length && <span className="text-xs text-muted-foreground">Create tags from the Leads page first.</span>}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground">
            <CalendarDays className="w-4 h-4" />
            <input type="datetime-local" value={campaignStartAt} onChange={event => setCampaignStartAt(event.target.value)} className="min-w-0 flex-1 bg-transparent text-foreground outline-none" />
          </label>
          <Button onClick={launch} disabled={launching || !selectedSequenceId} className="gap-2">
            {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Launch campaign
          </Button>
        </div>
        {campaignAudience === "list" && !contactListsQuery.data?.length && <p className="text-xs text-muted-foreground">Create a list from the Leads page first, or switch to a tag audience.</p>}
      </div>
    </section>
  )
}

// ── Email Identity Section ─────────────────────────────────────────────────────
function EmailIdentitySection({ product, productId }: { product: any; productId: number }) {
  const { user } = useAuth()
  const isOwner = user?.role === "owner"
  const qc = useQueryClient()
  const updateProduct = useUpdateProduct()

  const [editing, setEditing] = useState(false)
  const [fromName, setFromName] = useState(product.fromName ?? "")
  const [fromEmail, setFromEmail] = useState(product.fromEmail ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewFrom = fromEmail
    ? `${fromName.trim() || fromEmail} <${fromEmail}>`
    : null

  const handleEdit = () => {
    setFromName(product.fromName ?? "")
    setFromEmail(product.fromEmail ?? "")
    setError(null)
    setEditing(true)
  }

  const handleSave = async () => {
    if (fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      setError("Enter a valid email address")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateProduct.mutateAsync({
        id: productId,
        data: { fromName: fromName.trim() || undefined, fromEmail: fromEmail.trim() || undefined } as any,
      })
      await qc.invalidateQueries({ queryKey: getGetProductQueryKey(productId) })
      setEditing(false)
    } catch {
      setError("Failed to save — please try again")
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      await updateProduct.mutateAsync({ id: productId, data: { fromName: null, fromEmail: null } as any })
      await qc.invalidateQueries({ queryKey: getGetProductQueryKey(productId) })
      setEditing(false)
      setFromName("")
      setFromEmail("")
    } catch {
      setError("Failed to clear")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Email Identity
        </h2>
        {isOwner && !editing && (
          <Button
            variant="ghost" size="sm"
            onClick={handleEdit}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <Pencil className="w-3 h-3" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Sender name</label>
            <Input
              value={fromName}
              onChange={e => setFromName(e.target.value)}
              placeholder="Jane Smith"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Sender email</label>
            <Input
              value={fromEmail}
              onChange={e => setFromEmail(e.target.value)}
              placeholder="jane@yourdomain.com"
              type="email"
              className="h-10 rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Must be on a domain you've verified in Resend.{" "}
              <a
                href="https://resend.com/domains"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-0.5 hover:underline"
              >
                Manage domains <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </p>
          </div>

          {fromEmail && (
            <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Preview: <span className="text-foreground font-medium">{previewFrom}</span>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            {product.fromEmail && (
              <Button
                variant="ghost" size="sm"
                onClick={handleClear}
                disabled={saving}
                className="h-9 px-3 text-xs text-destructive hover:text-destructive rounded-xl"
              >
                Clear
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setEditing(false)} className="h-9 px-4 text-xs rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="h-9 px-4 text-xs rounded-xl gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-1.5">
          {product.fromEmail ? (
            <>
              <p className="text-xs text-muted-foreground">Emails sent for this product come from:</p>
              <p className="text-sm font-medium text-foreground">
                {product.fromName ? `${product.fromName} ` : ""}
                <span className="text-primary">&lt;{product.fromEmail}&gt;</span>
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Using workspace default — set a sender email to brand outbound mail for this product.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/60 pt-0.5">
            Team members assigned to this product send from this address.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Email Signature Section ────────────────────────────────────────────────────
function EmailSignatureSection({ product, productId }: { product: any; productId: number }) {
  const { user } = useAuth()
  const isOwner = user?.role === "owner"
  const qc = useQueryClient()
  const updateProduct = useUpdateProduct()

  const [editing, setEditing] = useState(false)
  const [signature, setSignature] = useState(product.emailSignature ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEdit = () => {
    setSignature(product.emailSignature ?? "")
    setError(null)
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateProduct.mutateAsync({
        id: productId,
        data: { emailSignature: signature.trim() || null } as any,
      })
      await qc.invalidateQueries({ queryKey: getGetProductQueryKey(productId) })
      setEditing(false)
    } catch {
      setError("Failed to save — please try again")
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      await updateProduct.mutateAsync({ id: productId, data: { emailSignature: null } as any })
      await qc.invalidateQueries({ queryKey: getGetProductQueryKey(productId) })
      setSignature("")
      setEditing(false)
    } catch {
      setError("Failed to clear")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Email Signature
        </h2>
        {isOwner && !editing && (
          <Button
            variant="ghost" size="sm"
            onClick={handleEdit}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <Pencil className="w-3 h-3" />
            {product.emailSignature ? "Edit" : "Set up"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Signature text</label>
            <Textarea
              value={signature}
              onChange={e => setSignature(e.target.value)}
              placeholder={"Jane Smith\nHead of Sales · Acme Inc.\njane@acme.com · +1 555 000 0000"}
              rows={5}
              className="rounded-xl text-sm resize-none bg-muted/40 border-border/30"
            />
            <p className="text-[11px] text-muted-foreground">
              Plain text only. Appended after a <span className="font-mono">--</span> separator on every email sent for this product.
            </p>
          </div>

          {signature.trim() && (
            <div className="rounded-xl bg-muted/40 px-3 py-2 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Preview</p>
              <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {"--\n"}{signature.trim()}
              </pre>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            {product.emailSignature && (
              <Button
                variant="ghost" size="sm"
                onClick={handleClear}
                disabled={saving}
                className="h-9 px-3 text-xs text-destructive hover:text-destructive rounded-xl"
              >
                Clear
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setEditing(false)} className="h-9 px-4 text-xs rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="h-9 px-4 text-xs rounded-xl gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          {product.emailSignature ? (
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {product.emailSignature}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No signature set — outbound emails will have no automatic sign-off.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Required unsubscribe footer ───────────────────────────────────────────────
function UnsubscribeFooterSection({ product, productId }: { product: any; productId: number }) {
  const { user } = useAuth()
  const isOwner = user?.role === "owner"
  const qc = useQueryClient()
  const updateProduct = useUpdateProduct()
  const [editing, setEditing] = useState(false)
  const [footerText, setFooterText] = useState(product.unsubscribeFooterText ?? "")
  const [senderLabel, setSenderLabel] = useState(product.unsubscribeSenderLabel ?? "")
  const [supportEmail, setSupportEmail] = useState(product.unsubscribeSupportEmail ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setFooterText(product.unsubscribeFooterText ?? "")
    setSenderLabel(product.unsubscribeSenderLabel ?? "")
    setSupportEmail(product.unsubscribeSupportEmail ?? "")
    setError(null)
  }

  const handleSave = async () => {
    if (supportEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail.trim())) {
      setError("Enter a valid support email address")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateProduct.mutateAsync({
        id: productId,
        data: {
          unsubscribeFooterText: footerText.trim() || null,
          unsubscribeSenderLabel: senderLabel.trim() || null,
          unsubscribeSupportEmail: supportEmail.trim() || null,
        },
      })
      await qc.invalidateQueries({ queryKey: getGetProductQueryKey(productId) })
      setEditing(false)
    } catch {
      setError("Failed to save — please try again")
    } finally {
      setSaving(false)
    }
  }

  const resolvedSender = senderLabel.trim() || product.unsubscribeSenderLabel || product.name || "our team"
  const resolvedText = footerText.trim() || product.unsubscribeFooterText || `You are receiving this email from ${resolvedSender}.`
  const resolvedSupport = supportEmail.trim() || product.unsubscribeSupportEmail

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Unsubscribe footer</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">A one-click unsubscribe link is always included and cannot be disabled.</p>
        </div>
        {isOwner && !editing && (
          <Button variant="ghost" size="sm" onClick={() => { reset(); setEditing(true) }} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1">
            <Pencil className="w-3 h-3" />
            Customize
          </Button>
        )}
      </div>

      {editing ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Company or sender label</label>
            <Input value={senderLabel} onChange={e => setSenderLabel(e.target.value)} maxLength={160} placeholder={product.name} className="rounded-xl bg-muted/40 border-border/30" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Footer message</label>
            <Textarea value={footerText} onChange={e => setFooterText(e.target.value)} maxLength={500} rows={2} placeholder={`You are receiving this email from ${product.name}.`} className="rounded-xl text-sm resize-none bg-muted/40 border-border/30" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Support contact <span className="font-normal">(optional)</span></label>
            <Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} maxLength={320} placeholder="support@example.com" className="rounded-xl bg-muted/40 border-border/30" />
          </div>

          <FooterPreview text={resolvedText} support={resolvedSupport} />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditing(false)} className="h-9 px-4 text-xs rounded-xl">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="h-9 px-4 text-xs rounded-xl gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          <FooterPreview text={resolvedText} support={resolvedSupport} />
        </div>
      )}
    </div>
  )
}

function FooterPreview({ text, support }: { text: string; support?: string | null }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-3 space-y-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Email footer preview</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
      <p className="text-xs text-primary underline underline-offset-2">Unsubscribe from future emails</p>
      {support && <p className="text-xs text-muted-foreground">Questions? {support}</p>}
    </div>
  )
}
