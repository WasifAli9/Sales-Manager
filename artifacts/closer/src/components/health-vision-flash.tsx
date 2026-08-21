import { useEffect, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Compass, Mountain, Heart, Activity, Shirt, Dumbbell } from "lucide-react"
import { useListVisionItems } from "@workspace/api-client-react"
import { getTodayStr } from "@/lib/date"

const HEALTH_REMINDERS = [
  // Appearance / first impressions
  "You are the product before your pitch is. Show up sharp — groomed, pressed, fit — or the deal is half-lost before you open your mouth.",
  "First impressions are decided in four seconds. Buyers read your body before your slides. Look like someone who wins.",
  "Dishevelled founder, dishevelled company. Iron the shirt, clean the shoes, stand tall. There are no excuses on a video call either.",
  "The sharpest salespeople in the world dress like they've already won. Dress for the revenue you want, not the revenue you have.",
  "You can't outpitch a bad first impression. Looking sharp isn't vanity — it's strategy.",
  "Buyers invest in people who look like they have their life together. Be that person. Every. Single. Day.",
  // Fitness / body
  "Your body is your business infrastructure. Neglect it and your thinking slows, your energy crashes, and the deals dry up. No excuses.",
  "A fit body sends a signal money can't buy: discipline. If you can't manage your own health, why would anyone trust you to manage their account?",
  "Champions train when they don't feel like it. That is exactly the point. Get moving today — no exceptions.",
  "Skipping the gym is a business decision. It costs you sharpness, confidence, and the edge in rooms where everyone else shows up fit and switched on.",
  "The close is won on energy. No workout today means less energy tomorrow. You are borrowing against yourself. Pay the debt now.",
  "Your competitors are training right now. While you're debating whether to work out, they're getting fitter, sharper, and hungrier. Go.",
  // Combined — look sharp + stay fit
  "Non-negotiable standard: one hard training session per day, look sharp on every call. Fitness and appearance are your silent pitch before a word is spoken.",
  "Sales is a contact sport. You need the body, the presence, and the energy of an athlete. There's no off-season. Train today.",
  "Elite founders look the part and train hard. Both. All the time. Not when convenient. Not when motivated. Every single day.",
]

const STORAGE_KEY = "closer:health-flash-dismissed"

function getTodayKey() {
  return `${STORAGE_KEY}:${getTodayStr()}`
}

function isDismissedToday() {
  try {
    return localStorage.getItem(getTodayKey()) === "true"
  } catch {
    return false
  }
}

function dismissToday() {
  try {
    localStorage.setItem(getTodayKey(), "true")
  } catch {
    // ignore
  }
}

/** Deterministic daily reminder — same message all day, rotates each day. */
function getDailyReminder() {
  const dayOfYear = Math.floor(
    (new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      86_400_000,
  )
  return HEALTH_REMINDERS[dayOfYear % HEALTH_REMINDERS.length]!
}

/** Pick an icon that matches the reminder's theme */
function getReminderIcon(reminder: string) {
  if (reminder.includes("sharp") || reminder.includes("dress") || reminder.includes("Dishevelled") || reminder.includes("Shirt") || reminder.includes("look")) {
    return <Shirt className="w-5 h-5 text-success" />
  }
  if (reminder.includes("train") || reminder.includes("gym") || reminder.includes("workout") || reminder.includes("fit")) {
    return <Dumbbell className="w-5 h-5 text-success" />
  }
  return <Activity className="w-5 h-5 text-success" />
}

interface HealthVisionFlashProps {
  /** Controlled: pass true to force the dialog open (e.g. from a button). */
  forceOpen?: boolean
  onClose?: () => void
}

export function HealthVisionFlash({ forceOpen, onClose }: HealthVisionFlashProps) {
  const [open, setOpen] = useState(false)
  const { data: visionItems = [] } = useListVisionItems()

  // Auto-show once per day unless already dismissed
  useEffect(() => {
    if (!isDismissedToday()) {
      const timer = setTimeout(() => setOpen(true), 1200)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [])

  // Controlled override
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  const handleClose = () => {
    setOpen(false)
    dismissToday()
    onClose?.()
  }

  const northStar = visionItems.find((i) => i.kind === "north_star")
  const milestone = visionItems.find((i) => i.kind === "milestone")
  const charity = visionItems.find((i) => i.kind === "charity")
  const reminder = getDailyReminder()

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-sm mx-auto rounded-3xl border-0 bg-card p-0 overflow-hidden gap-0 [&>button]:text-muted-foreground">
        {/* Health banner */}
        <div className="bg-gradient-to-br from-success/20 via-primary/10 to-transparent px-6 pt-8 pb-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="bg-success/20 rounded-xl p-2">
              {getReminderIcon(reminder)}
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-success">Daily Standard</span>
          </div>
          <p className="text-base font-semibold leading-snug text-foreground">
            {reminder}
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mx-6" />

        {/* Vision snapshot */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Your Why</p>

          {northStar && (
            <div className="flex items-start gap-3">
              <div className="bg-primary/15 rounded-xl p-2 shrink-0">
                <Compass className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-0.5">North Star</p>
                <p className="text-sm font-bold leading-snug">{northStar.title}</p>
              </div>
            </div>
          )}

          {milestone && (
            <div className="flex items-start gap-3">
              <div className="bg-warn/15 rounded-xl p-2 shrink-0">
                <Mountain className="w-4 h-4 text-warn" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-0.5">Next Milestone</p>
                <p className="text-sm font-bold leading-snug">{milestone.title}</p>
              </div>
            </div>
          )}

          {charity && (
            <div className="flex items-start gap-3">
              <div className="bg-success/15 rounded-xl p-2 shrink-0">
                <Heart className="w-4 h-4 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium mb-0.5">Charity Goal</p>
                <p className="text-sm font-bold leading-snug mb-2">{charity.title}</p>
                {charity.targetValue && (
                  <Progress value={0} className="h-2 bg-muted" indicatorColor="bg-success" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          <Button
            onClick={handleClose}
            className="w-full rounded-2xl h-12 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Understood — no excuses
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
