/**
 * Floating bottom-right widget that shows generation progress across all pages.
 * Appears when a schedule is being generated and stays visible while navigating.
 */
import { cn } from "@/lib/utils"
import {
  Sparkles, CheckCircle2, XCircle, X, ArrowRight, Loader2,
} from "lucide-react"
import { useGeneration } from "@/contexts/generation-context"
import { useLocation } from "wouter"

const RESEARCH_STEPS = [
  "Reading your website",
  "Extracting brand colours",
  "Understanding who you serve",
  "Finding competitors",
  "Building content calendar",
  "Saving posts",
  "Generating visuals",
] as const

export function GenerationWidget() {
  const { state, dismiss } = useGeneration()
  const [, navigate] = useLocation()

  if (!state) return null

  const { productId, productName, status, isStarting, error, navigateOnDone } = state
  const step  = status?.step ?? 1
  const total = RESEARCH_STEPS.length
  const done  = status?.done ?? false

  const isDismissable = done || !!error

  const currentLabel = isStarting
    ? "Connecting to server…"
    : error
    ? "Generation failed"
    : done
    ? "Your content calendar is ready!"
    : status?.message ?? RESEARCH_STEPS[Math.min(step - 1, total - 1)]

  const progress = done
    ? 100
    : isStarting
    ? 4
    : Math.round((step / total) * 95)   // cap at 95 until confirmed done

  const handleViewPosts = () => {
    const dest = navigateOnDone ?? `/products/${productId}/social`
    navigate(dest)
    dismiss()
  }

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-50 w-[308px]",
        "bg-card/95 backdrop-blur-md border border-border/30 rounded-2xl shadow-2xl overflow-hidden",
        "animate-in slide-in-from-bottom-3 fade-in duration-300",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div
          className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center border shrink-0",
            done  ? "bg-emerald-500/15 border-emerald-500/30"
              : error ? "bg-red-500/15 border-red-500/30"
              : "bg-primary/12 border-primary/25",
          )}
        >
          {done  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            : error ? <XCircle     className="w-4 h-4 text-red-400" />
            : <Sparkles    className="w-4 h-4 text-primary animate-pulse" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground leading-none mb-0.5">
            {done ? "Schedule ready" : error ? "Generation failed" : "Building schedule…"}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">{productName}</p>
        </div>

        {isDismissable && (
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 -mr-1"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Current step message */}
      <div className="px-4 pb-2.5">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 leading-relaxed">
          {!done && !error && (
            <Loader2 className="w-2.5 h-2.5 shrink-0 animate-spin text-primary" />
          )}
          {currentLabel}
        </p>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="h-[3px] bg-muted/40 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              done  ? "bg-emerald-500"
                : error ? "bg-red-500"
                : "bg-gradient-to-r from-primary/60 to-primary",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        {!done && !error && (
          <p className="text-[9px] text-muted-foreground/40 mt-1 text-right">
            Step {isStarting ? 1 : step} of {total}
          </p>
        )}
      </div>

      {/* Brand colours (shown once extracted) */}
      {status?.brandColors && status.brandColors.length > 0 && (
        <div className="px-4 pb-2.5 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground shrink-0">Brand</span>
          <div className="flex gap-1.5">
            {status.brandColors.slice(0, 8).map(c => (
              <div
                key={c}
                className="w-3.5 h-3.5 rounded-full border border-white/15 shadow"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer CTA / error message */}
      {(done || error) && (
        <div className="border-t border-border/15 px-4 py-3">
          {done ? (
            <button
              onClick={handleViewPosts}
              className="flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors font-medium"
            >
              View posts <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
