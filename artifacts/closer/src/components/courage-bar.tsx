/**
 * CourageBar — shown on the Today page when no SELL/CX activity has been done.
 * Escalates in intensity as the day progresses.
 * Includes a browser notification opt-in button.
 */
import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Zap, X, Bell, BellOff, ChevronRight, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useCourageReminders,
  useNotificationPermission,
  isCourageBarDismissedToday,
  dismissCourageBarToday,
  IN_APP_MESSAGES,
} from "@/hooks/use-courage-reminders"
import { cn } from "@/lib/utils"

function getUrgency(): "low" | "medium" | "high" | "critical" {
  const h = new Date().getHours()
  if (h < 10) return "low"
  if (h < 13) return "medium"
  if (h < 16) return "high"
  return "critical"
}

const URGENCY_STYLES = {
  low:      { bar: "border-primary/30 bg-primary/5",          icon: "text-primary",     label: "text-primary/80" },
  medium:   { bar: "border-warn/40 bg-warn/5",                icon: "text-warn",        label: "text-warn/80" },
  high:     { bar: "border-orange-500/40 bg-orange-500/5",    icon: "text-orange-400",  label: "text-orange-400/80" },
  critical: { bar: "border-destructive/50 bg-destructive/5",  icon: "text-destructive", label: "text-destructive/80" },
}

const URGENCY_LABELS = {
  low:      "Morning check-in",
  medium:   "Half-day warning",
  high:     "Time is running out",
  critical: "Day nearly gone",
}

interface CourageBarProps {
  hasSellActivity: boolean
  sellActivityCount: number
  onNavigateToPipeline?: () => void
}

export function CourageBar({ hasSellActivity, sellActivityCount, onNavigateToPipeline }: CourageBarProps) {
  const [dismissed, setDismissed] = useState(isCourageBarDismissedToday)
  const [urgency, setUrgency] = useState(getUrgency)
  const [msgIndex, setMsgIndex] = useState(() => new Date().getDate() % IN_APP_MESSAGES.length)
  const { permission, request } = useNotificationPermission()
  const [notifStatus, setNotifStatus] = useState<NotificationPermission>(permission)
  const [showNotifHint, setShowNotifHint] = useState(false)

  // Run the background notification engine whenever this component is mounted
  useCourageReminders(hasSellActivity)

  // Refresh urgency every minute
  useEffect(() => {
    const t = setInterval(() => setUrgency(getUrgency()), 60_000)
    return () => clearInterval(t)
  }, [])

  const handleDismiss = () => {
    dismissCourageBarToday()
    setDismissed(true)
  }

  const handleNextMessage = () => {
    setMsgIndex(i => (i + 1) % IN_APP_MESSAGES.length)
  }

  const handleRequestNotif = async () => {
    const result = await request()
    setNotifStatus(result)
    setShowNotifHint(false)
  }

  // When activity is done — show a brief "keep going" affirmation instead
  if (hasSellActivity) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3 flex items-center gap-3"
      >
        <Flame className="w-5 h-5 text-success shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-success">
            {sellActivityCount} outreach action{sellActivityCount !== 1 ? "s" : ""} today. Keep the fire burning.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Don't stop — one more conversation could change everything.</p>
        </div>
      </motion.div>
    )
  }

  if (dismissed) return null

  const styles = URGENCY_STYLES[urgency]
  const msg = IN_APP_MESSAGES[msgIndex]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        className={cn("rounded-2xl border px-4 py-3 space-y-3 relative", styles.bar)}
      >
        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label="Dismiss for today"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Urgency label */}
        <div className="flex items-center gap-2 pr-6">
          <Zap className={cn("w-4 h-4 shrink-0", styles.icon)} />
          <span className={cn("text-[10px] font-bold uppercase tracking-widest", styles.label)}>
            {URGENCY_LABELS[urgency]}
          </span>
        </div>

        {/* Main message */}
        <div>
          <p className="text-sm font-bold text-foreground leading-snug pr-2">{msg.headline}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{msg.sub}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateToPipeline && (
            <Button
              size="sm"
              className={cn(
                "h-8 px-3 rounded-xl text-xs gap-1.5 font-semibold",
                urgency === "critical" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              )}
              onClick={onNavigateToPipeline}
            >
              Open pipeline
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
          <button
            onClick={handleNextMessage}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Different message
          </button>
        </div>

        {/* Notification opt-in — shown only if not yet granted/denied */}
        {notifStatus === "default" && (
          <div className="border-t border-border/40 pt-2.5 flex items-center gap-2">
            {showNotifHint ? (
              <>
                <p className="text-xs text-muted-foreground flex-1">
                  Allow reminders every 90 min during work hours — so procrastination doesn't hide in the background.
                </p>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs rounded-xl gap-1.5 shrink-0" onClick={handleRequestNotif}>
                  <Bell className="w-3 h-3" />
                  Enable
                </Button>
              </>
            ) : (
              <button
                onClick={() => setShowNotifHint(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bell className="w-3 h-3" />
                Get reminders even when the app is in the background
              </button>
            )}
          </div>
        )}

        {notifStatus === "granted" && (
          <div className="border-t border-border/40 pt-2 flex items-center gap-1.5">
            <Bell className="w-3 h-3 text-muted-foreground/50" />
            <p className="text-[10px] text-muted-foreground/50">Reminders active every 90 min during work hours</p>
          </div>
        )}

        {notifStatus === "denied" && (
          <div className="border-t border-border/40 pt-2 flex items-center gap-1.5">
            <BellOff className="w-3 h-3 text-muted-foreground/40" />
            <p className="text-[10px] text-muted-foreground/40">Notifications blocked — enable in your browser settings to get background reminders</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
