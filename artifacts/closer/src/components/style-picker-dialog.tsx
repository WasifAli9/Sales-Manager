/**
 * StylePickerDialog
 *
 * Shown before image generation begins so the user can pick a visual style,
 * upload a reference image, manage their brand asset library, and enter
 * additional creative direction for the AI.
 *
 * onConfirm receives: (styleGuide, stylePreset, selectedAssetUrls)
 */
import { useState, useRef, useCallback, useEffect } from "react"
import { Loader2, Upload, X, CheckCircle2, ImageIcon, Sparkles, RotateCcw, Plus, Trash2, Image } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  useProductAssets,
  useUploadProductAsset,
  useDeleteProductAsset,
  type ProductAsset,
} from "@/hooks/use-product-assets"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

// ── Preset styles ─────────────────────────────────────────────────────────────
const PRESET_STYLES = [
  {
    id: "minimalist",
    label: "Minimalist",
    description: "Clean, simple, breathing room",
    styleGuide:
      "Minimalist aesthetic: clean white or very light neutral backgrounds, single focal subject, generous negative space, soft diffused lighting with no harsh shadows, muted or monochromatic palette, uncluttered composition — every element is intentional.",
    preview: (
      <div className="w-full h-full bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-slate-300" />
      </div>
    ),
  },
  {
    id: "bold-vibrant",
    label: "Bold & Vibrant",
    description: "High-energy, saturated colors",
    styleGuide:
      "Bold vibrant aesthetic: high-contrast saturated colors, dynamic diagonal compositions, punchy graphic design elements, energetic kinetic feel. Rich jewel tones or electric neon accents, strong visual impact that commands attention on a social feed.",
    preview: (
      <div className="w-full h-full bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600 flex items-center justify-center">
        <div className="w-6 h-6 rounded bg-white/30 rotate-12" />
      </div>
    ),
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    description: "Warm, authentic, real moments",
    styleGuide:
      "Lifestyle photography aesthetic: warm golden-hour or soft natural window light, candid authentic human moments, shallow depth of field with creamy bokeh, genuine emotions and real environments. Warm film-like tones, slightly lifted shadows, approachable and relatable storytelling.",
    preview: (
      <div className="w-full h-full bg-gradient-to-br from-amber-100 via-orange-100 to-rose-100 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-amber-300/60 flex items-center justify-center text-amber-700 text-lg">☀</div>
      </div>
    ),
  },
  {
    id: "dark-moody",
    label: "Dark & Moody",
    description: "Cinematic, dramatic, premium",
    styleGuide:
      "Dark moody aesthetic: deep rich shadows, dramatic chiaroscuro lighting with strong directional light, premium cinematic atmosphere. Deep navy, charcoal, and forest tones with selective highlights. Luxurious textures, introspective mood, high-contrast editorial quality.",
    preview: (
      <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center">
        <div className="w-4 h-12 bg-white/20 rounded-full blur-sm" />
      </div>
    ),
  },
  {
    id: "corporate",
    label: "Corporate Clean",
    description: "Polished, professional, trusted",
    styleGuide:
      "Corporate clean aesthetic: polished professional imagery, precise geometric compositions, clean light environments, modern office or neutral studio settings. Crisp sharp focus, balanced symmetrical layouts, palette of whites, greys, and brand accent colors. Conveys trust and competence.",
    preview: (
      <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center gap-1">
        {[3, 5, 4, 6, 3].map((h, i) => (
          <div key={i} className={`w-1.5 rounded-t bg-blue-400/70`} style={{ height: `${h * 4}px` }} />
        ))}
      </div>
    ),
  },
  {
    id: "illustration",
    label: "Illustration",
    description: "Artistic, creative, handcrafted",
    styleGuide:
      "Digital illustration aesthetic: hand-crafted artistic style with visible brushwork or clean vector shapes, creative visual metaphors, rich textures and layered compositions. Bold outlines, cel-shading or watercolor washes, expressive conceptual imagery with a unique artistic identity.",
    preview: (
      <div className="w-full h-full bg-gradient-to-br from-violet-100 via-fuchsia-100 to-pink-100 flex items-center justify-center">
        <div className="w-8 h-8 rounded-tl-full rounded-tr-full rounded-bl-none rounded-br-full bg-violet-400/60 rotate-45" />
      </div>
    ),
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────
type Props = {
  productId: number
  month: string  // "YYYY-MM-DD" (first of month)
  onConfirm: (styleGuide: string | undefined, stylePreset: string | undefined, selectedAssetUrls: string[]) => void
  onCancel: () => void
  savedStyle?: string | null
  savedStylePreset?: string | null
  onClearSaved?: () => void
  isOwner?: boolean
}

type UploadState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "done"; styleGuide: string; previewUrl: string }
  | { status: "error"; message: string; previewUrl?: string }

export function StylePickerDialog({
  productId,
  month,
  onConfirm,
  onCancel,
  savedStyle,
  savedStylePreset,
  onClearSaved,
  isOwner,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [upload, setUpload] = useState<UploadState>({ status: "idle" })
  const [extraInstructions, setExtraInstructions] = useState("")
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<number>>(new Set())
  const [assetUploadName, setAssetUploadName] = useState("")
  const [assetUploadType, setAssetUploadType] = useState<"logo" | "screenshot" | "other">("logo")
  const [addingAsset, setAddingAsset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const assetFileRef = useRef<HTMLInputElement>(null)

  const { toast } = useToast()
  const { data: assets = [], isLoading: assetsLoading } = useProductAssets(productId)
  const uploadAsset = useUploadProductAsset(productId)
  const deleteAsset = useDeleteProductAsset(productId)

  // Pre-select from saved style on first render
  useEffect(() => {
    if (!savedStyle) return
    if (savedStylePreset && savedStylePreset !== "custom") {
      const preset = PRESET_STYLES.find(s => s.id === savedStylePreset)
      if (preset) { setSelected(savedStylePreset); return }
    }
    const matchedPreset = PRESET_STYLES.find(s => s.styleGuide === savedStyle)
    if (matchedPreset) {
      setSelected(matchedPreset.id)
    } else {
      setSelected("custom")
      setUpload({ status: "done", styleGuide: savedStyle, previewUrl: "" })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const monthLabel = new Date(month + "T12:00:00").toLocaleString("default", {
    month: "long",
    year: "numeric",
  })

  const hasSaved = Boolean(savedStyle)

  // ── Handle reference image upload ──────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return
      const previewUrl = URL.createObjectURL(file)
      setSelected("custom")
      setUpload({ status: "analyzing" })

      try {
        const reader = new FileReader()
        const b64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        const res = await fetch(`${BASE}/api/products/${productId}/social/analyze-style`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: b64, mimeType: file.type }),
        })

        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: "Analysis failed" }))
          setUpload({ status: "error", message: error ?? "Analysis failed", previewUrl })
          return
        }

        const { styleGuide } = await res.json() as { styleGuide: string }
        setUpload({ status: "done", styleGuide, previewUrl })
      } catch {
        setUpload({ status: "error", message: "Could not analyse the image.", previewUrl })
      }
    },
    [productId],
  )

  // ── Handle brand asset upload ──────────────────────────────────────────────
  const handleAssetFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return
      const name = assetUploadName.trim() || file.name.replace(/\.[^.]+$/, "")
      try {
        const reader = new FileReader()
        const b64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1])
          reader.onerror = () => reject(new Error("Could not read file"))
          reader.readAsDataURL(file)
        })
        const asset = await uploadAsset.mutateAsync({ name, type: assetUploadType, imageBase64: b64, mimeType: file.type })
        // Auto-select newly uploaded asset
        setSelectedAssetIds(prev => new Set([...prev, asset.id]))
        setAssetUploadName("")
        setAddingAsset(false)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed"
        toast({ title: "Upload failed", description: message, variant: "destructive" })
      }
    },
    [assetUploadName, assetUploadType, uploadAsset, toast],
  )

  const toggleAsset = (id: number) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    const extra = extraInstructions.trim()
    const appendExtra = (base: string | undefined) =>
      base && extra ? `${base}\n\nAdditional creative direction: ${extra}` : base ?? (extra || undefined)

    const selectedAssetUrls = assets
      .filter(a => selectedAssetIds.has(a.id))
      .map(a => a.storageUrl)

    if (selected === "custom") {
      const guide = upload.status === "done" ? upload.styleGuide : undefined
      const merged = appendExtra(guide)
      onConfirm(merged, merged ? "custom" : undefined, selectedAssetUrls)
    } else if (selected) {
      const preset = PRESET_STYLES.find(s => s.id === selected)
      onConfirm(appendExtra(preset?.styleGuide), preset?.id, selectedAssetUrls)
    } else {
      onConfirm(appendExtra(undefined), undefined, selectedAssetUrls)
    }
  }

  const customPreviewUrl =
    upload.status === "done" || upload.status === "error" ? upload.previewUrl : undefined

  const isSavedCustom =
    selected === "custom" &&
    upload.status === "done" &&
    !upload.previewUrl

  const typeLabels: Record<string, string> = { logo: "Logo", screenshot: "Screenshot", other: "Other" }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Choose a visual style</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {hasSaved
                ? `Your last-used style is pre-selected. Change it or keep it for ${monthLabel}.`
                : `Pick a look for your ${monthLabel} images, or upload a photo you love.`}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 pb-2 space-y-5">

          {/* ── Style grid ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PRESET_STYLES.map(style => (
              <button
                key={style.id}
                onClick={() => setSelected(style.id)}
                className={cn(
                  "group relative rounded-xl border-2 overflow-hidden text-left transition-all",
                  selected === style.id
                    ? "border-primary shadow-lg shadow-primary/10"
                    : "border-border/20 hover:border-border/50",
                )}
              >
                <div className="aspect-video w-full overflow-hidden">{style.preview}</div>
                <div className="px-3 py-2.5">
                  <p className="text-sm font-medium leading-none">{style.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{style.description}</p>
                </div>
                {selected === style.id && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle2 className="w-4 h-4 text-primary fill-primary/10" />
                  </div>
                )}
                {savedStylePreset === style.id && selected !== style.id && (
                  <div className="absolute top-2 left-2">
                    <span className="text-[9px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      Last used
                    </span>
                  </div>
                )}
              </button>
            ))}

            {/* Upload reference image card */}
            <button
              onClick={() => {
                if (isSavedCustom || upload.status !== "analyzing") fileRef.current?.click()
              }}
              className={cn(
                "group relative rounded-xl border-2 overflow-hidden text-left transition-all",
                selected === "custom"
                  ? "border-primary shadow-lg shadow-primary/10"
                  : "border-border/20 hover:border-border/50 border-dashed",
              )}
            >
              <div className="aspect-video w-full overflow-hidden relative bg-muted/30">
                {isSavedCustom ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-50 to-pink-50 dark:from-violet-950/30 dark:to-pink-950/30">
                    <Upload className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                ) : customPreviewUrl ? (
                  <img src={customPreviewUrl} alt="Reference" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                )}
                {upload.status === "analyzing" && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                    <span className="text-[10px] text-white/80">Analysing style…</span>
                  </div>
                )}
              </div>
              <div className="px-3 py-2.5">
                <p className="text-sm font-medium leading-none">
                  {isSavedCustom ? "Your saved style" : upload.status === "done" ? "Your style" : "Upload reference"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isSavedCustom
                    ? "Tap to upload a new reference"
                    : upload.status === "done"
                    ? "Style extracted ✓"
                    : upload.status === "error"
                    ? upload.message
                    : "Upload an image you love"}
                </p>
              </div>
              {selected === "custom" && upload.status === "done" && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="w-4 h-4 text-primary fill-primary/10" />
                </div>
              )}
              {savedStylePreset === "custom" && selected !== "custom" && (
                <div className="absolute top-2 left-2">
                  <span className="text-[9px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    Last used
                  </span>
                </div>
              )}
            </button>
          </div>

          {/* Analysed style description */}
          {selected === "custom" && upload.status === "done" && (
            <div className="rounded-xl bg-muted/30 border border-border/20 px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {isSavedCustom ? "Saved style" : "Detected style"}
              </p>
              <p className="text-sm text-foreground/80 leading-relaxed">{upload.styleGuide}</p>
            </div>
          )}

          {/* ── Brand asset library ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Brand Assets
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Select logos or screenshots for the AI to reference in images
                </p>
              </div>
              <button
                onClick={() => setAddingAsset(v => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add asset
              </button>
            </div>

            {/* Add asset form */}
            {addingAsset && (
              <div className="mb-3 p-3 rounded-xl border border-border/30 bg-muted/20 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assetUploadName}
                    onChange={e => setAssetUploadName(e.target.value)}
                    placeholder="Asset name (e.g. Primary Logo)"
                    className="flex-1 text-sm bg-background border border-border/30 rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/40 placeholder:text-muted-foreground/40"
                  />
                  <select
                    value={assetUploadType}
                    onChange={e => setAssetUploadType(e.target.value as "logo" | "screenshot" | "other")}
                    className="text-sm bg-background border border-border/30 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary/40 text-foreground"
                  >
                    <option value="logo">Logo</option>
                    <option value="screenshot">Screenshot</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => assetFileRef.current?.click()}
                    disabled={uploadAsset.isPending}
                    className="flex items-center gap-1.5 text-sm text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {uploadAsset.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Upload className="w-3.5 h-3.5" />}
                    Choose image
                  </button>
                  <button
                    onClick={() => { setAddingAsset(false); setAssetUploadName("") }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2"
                  >
                    Cancel
                  </button>
                  {uploadAsset.isError && (
                    <span className="text-[11px] text-destructive self-center">
                      {(uploadAsset.error as Error)?.message ?? "Upload failed"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Asset grid */}
            {assetsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading assets…
              </div>
            ) : assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/30 bg-muted/10 py-6 text-center">
                <Image className="w-6 h-6 text-muted-foreground/30 mb-2" />
                <p className="text-[12px] text-muted-foreground/60">No assets yet — add your logo or a product screenshot</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {assets.map(asset => {
                  const isSelected = selectedAssetIds.has(asset.id)
                  return (
                    <div key={asset.id} className="relative group">
                      <button
                        onClick={() => toggleAsset(asset.id)}
                        className={cn(
                          "w-full rounded-xl border-2 overflow-hidden transition-all",
                          isSelected
                            ? "border-primary shadow-md shadow-primary/10"
                            : "border-border/20 hover:border-border/50",
                        )}
                      >
                        <div className="aspect-square relative bg-muted/30">
                          <img
                            src={`${BASE}${asset.storageUrl}`}
                            alt={asset.name}
                            className="w-full h-full object-contain p-1"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5 text-primary" />
                            </div>
                          )}
                        </div>
                        <div className="px-2 py-1.5">
                          <p className="text-[11px] font-medium leading-none truncate">{asset.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{typeLabels[asset.type] ?? asset.type}</p>
                        </div>
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteAsset.mutate(asset.id) }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title="Remove asset"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {selectedAssetIds.size > 0 && (
              <p className="text-[11px] text-primary mt-2">
                {selectedAssetIds.size} asset{selectedAssetIds.size > 1 ? "s" : ""} selected — AI will reference {selectedAssetIds.size > 1 ? "these" : "this"} in every image
              </p>
            )}
          </div>

          {/* ── Extra instructions text box ── */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Additional creative direction <span className="normal-case font-normal">(optional)</span>
            </label>
            <Textarea
              value={extraInstructions}
              onChange={e => setExtraInstructions(e.target.value)}
              placeholder="e.g. always include our logo in the corner, avoid showing people's faces, use a desert landscape backdrop, keep text overlays minimal…"
              className="resize-none text-sm min-h-[80px] bg-muted/20 border-border/30 focus:border-primary/40 placeholder:text-muted-foreground/40"
              maxLength={10000}
            />
            {extraInstructions.length > 400 && (
              <p className="text-[11px] text-muted-foreground text-right">
                {extraInstructions.length}/500
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border/20 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onConfirm(undefined, undefined, [])}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              Skip — no style preference
            </button>
            {hasSaved && isOwner && onClearSaved && (
              <button
                onClick={() => {
                  onClearSaved()
                  setSelected(null)
                  setUpload({ status: "idle" })
                }}
                className="flex items-center gap-1 text-sm text-muted-foreground/70 hover:text-destructive transition-colors"
                title="Remove the saved style so the picker starts fresh next time"
              >
                <RotateCcw className="w-3 h-3" />
                Reset saved
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={selected === "custom" && upload.status === "analyzing"}
              className="gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate {monthLabel}
            </Button>
          </div>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ""
          }}
        />
        <input
          ref={assetFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void handleAssetFile(file)
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
