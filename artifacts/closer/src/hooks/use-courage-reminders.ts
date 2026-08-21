/**
 * Courage Reminders
 *
 * Requests browser notification permission and fires consequence-based
 * reminders every 90 minutes during work hours (8am–7pm) when the user
 * has not logged a SELL/CX activity today.
 *
 * Also tracks whether the user has dismissed the in-app courage bar today.
 */
import { useEffect, useRef, useCallback } from "react"

const REMINDER_INTERVAL_MS = 90 * 60 * 1000 // 90 minutes
const WORK_START_H = 8
const WORK_END_H = 19
const LS_LAST_NOTIF = "courage_last_notif"
const LS_BAR_DISMISSED = "courage_bar_dismissed_date"

// ── Brutal consequence messages ────────────────────────────────────────────
const CONSEQUENCE_MESSAGES = [
  {
    title: "You're invisible right now.",
    body: "Your prospects don't know you exist. Someone else is in their inbox. Are you going to let them win?",
  },
  {
    title: "No outreach = no revenue.",
    body: "Every hour you delay is an hour a competitor spends building the relationship you should own.",
  },
  {
    title: "You can't close deals in your head.",
    body: "The conversation you're avoiding is the one that makes or breaks this month. Send the message.",
  },
  {
    title: "They've already forgotten you.",
    body: "Prospects have short memories. You're not top of mind. You're not even in the picture right now.",
  },
  {
    title: "Busy ≠ productive.",
    body: "You've been doing everything except the one thing that actually pays you. Time to fix that.",
  },
  {
    title: "Your pipeline doesn't fill itself.",
    body: "Every deal you have came from an uncomfortable conversation you had anyway. Have one now.",
  },
  {
    title: "This is the moment that separates you.",
    body: "Most founders stop here. The ones who win send the message even when they don't feel ready.",
  },
  {
    title: "You're leaving money on the table.",
    body: "That prospect you've been thinking about all week? They're talking to your competition today.",
  },
  {
    title: "Fear is expensive.",
    body: "Every day you avoid reaching out costs you real money. What's one more rejection compared to zero revenue?",
  },
  {
    title: "The market doesn't wait for you to feel ready.",
    body: "Ship it. Send it. Say it. Do it imperfect. The cost of delay is higher than the cost of imperfection.",
  },
  {
    title: "You know what looks like an idiot?",
    body: "Watching from the sidelines while others build the pipeline you could have had. Reach out. Now.",
  },
  {
    title: "Nobody's coming to rescue you.",
    body: "No algorithm, no referral, no lucky break is coming today. The only path to revenue is a conversation you start.",
  },
  {
    title: "You're overthinking the email.",
    body: "They won't care if it's perfectly worded. They care if it's relevant. Send the imperfect version now.",
  },
  {
    title: "Procrastination has a price tag.",
    body: "You already know the cost of not closing this month. Is avoiding one awkward message worth that?",
  },
  {
    title: "Your future self is watching.",
    body: "In 30 days you'll either be proud you acted today, or frustrated you didn't. Make the choice now.",
  },
]

// ── In-app bar messages (shorter, punchier) ────────────────────────────────
export const IN_APP_MESSAGES = [
  { headline: "No outreach today. Not yet.", sub: "Every hour you wait, a competitor gets warmer." },
  { headline: "Your prospects don't know you exist right now.", sub: "Fix that with one message. Just one." },
  { headline: "The deal you want is one conversation away.", sub: "The conversation you keep postponing." },
  { headline: "Hiding behind planning is still hiding.", sub: "You don't need a better plan. You need to send the message." },
  { headline: "You look invisible right now.", sub: "Prospects mistake silence for disinterest. Don't let them." },
  { headline: "The discomfort lasts 30 seconds.", sub: "The regret lasts all month. Send it." },
  { headline: "They've already forgotten you.", sub: "Reach out before you become a distant memory." },
  { headline: "Your competitors are not overthinking it.", sub: "They're in inboxes right now. Are you?" },
  { headline: "Revenue doesn't appear. It's made.", sub: "Made by conversations you initiate. Start one." },
  { headline: "No one will hand you the deal.", sub: "The pipeline is yours to build. Build it." },
  { headline: "Courage is a muscle. Use it or lose it.", sub: "One message now is better than ten perfect ones later." },
  { headline: "What's the worst they can say?", sub: "No. And you already have that. So send it." },
]

function pickMessage<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

function isWorkHours(): boolean {
  const h = new Date().getHours()
  return h >= WORK_START_H && h < WORK_END_H
}

function shouldFireNotification(lastMs: number | null): boolean {
  if (!isWorkHours()) return false
  if (!lastMs) return true
  return Date.now() - lastMs >= REMINDER_INTERVAL_MS
}

function fireNotification(hasSellActivity: boolean) {
  if (!("Notification" in window)) return

  const seed = Math.floor(Date.now() / REMINDER_INTERVAL_MS)
  const msg = pickMessage(CONSEQUENCE_MESSAGES, seed)

  const title = hasSellActivity
    ? "Keep the momentum going 🔥"
    : msg.title

  const body = hasSellActivity
    ? "You've been reaching out — keep going. One more conversation could change everything today."
    : msg.body

  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        tag: "closer-courage", // replaces previous notification
        silent: false,
      })
      lsSet(LS_LAST_NOTIF, String(Date.now()))
    } catch {
      // Silently ignore — some browsers restrict notifications in certain contexts
    }
  }
}

export function useNotificationPermission() {
  const request = useCallback(async (): Promise<NotificationPermission> => {
    if (!("Notification" in window)) return "denied"
    if (Notification.permission !== "default") return Notification.permission
    return Notification.requestPermission()
  }, [])

  return {
    permission: typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "denied" as NotificationPermission,
    request,
  }
}

export function useCourageReminders(hasSellActivity: boolean) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const check = useCallback(() => {
    const lastMs = lsGet(LS_LAST_NOTIF)
    if (shouldFireNotification(lastMs ? Number(lastMs) : null)) {
      fireNotification(hasSellActivity)
    }
  }, [hasSellActivity])

  useEffect(() => {
    // Check on focus / tab visibility
    const onVisible = () => { if (document.visibilityState === "visible") check() }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", check)

    // Periodic check every 5 minutes (lightweight — just compares timestamps)
    timerRef.current = setInterval(check, 5 * 60 * 1000)

    // Check once on mount
    check()

    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", check)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [check])
}

// ── Safe localStorage helpers ──────────────────────────────────────────────
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val) } catch { /* ignore */ }
}

// ── Bar dismissal helpers ──────────────────────────────────────────────────
export function isCourageBarDismissedToday(): boolean {
  return lsGet(LS_BAR_DISMISSED) === new Date().toDateString()
}

export function dismissCourageBarToday(): void {
  lsSet(LS_BAR_DISMISSED, new Date().toDateString())
}

// Pick a stable in-app message for today
export function getTodayInAppMessage() {
  const seed = new Date().getDate() + new Date().getMonth() * 31
  return pickMessage(IN_APP_MESSAGES, seed)
}
