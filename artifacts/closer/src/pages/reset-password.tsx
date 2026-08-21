import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TrendingUp, Eye, EyeOff, CheckCircle2, Loader2, AlertCircle, ArrowLeft } from "lucide-react"
import { Link, useSearch } from "wouter"
import { motion, AnimatePresence } from "framer-motion"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export default function ResetPasswordPage() {
  const search = useSearch()
  const token = new URLSearchParams(search).get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords don't match."); return }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const d = await res.json() as { error?: string }
      if (!res.ok) {
        setError(d.error ?? "Something went wrong.")
      } else {
        setDone(true)
      }
    } catch {
      setError("Network error — try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 mb-10"
      >
        <div className="bg-primary/15 rounded-3xl p-5">
          <TrendingUp className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-foreground">Closer</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm bg-card rounded-3xl border border-border/30 p-8"
      >
        <AnimatePresence mode="wait">
          {!token ? (
            <motion.div key="notoken" className="text-center space-y-4 py-4">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">Invalid or missing reset token. Request a new link.</p>
              <Link href="/forgot-password">
                <Button variant="outline" className="w-full h-12 rounded-2xl">Request new link</Button>
              </Link>
            </motion.div>
          ) : done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center gap-5 py-4"
            >
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Password updated</h2>
                <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
              </div>
              <Link href="/login" className="w-full">
                <Button className="w-full h-12 rounded-2xl font-bold">Sign in</Button>
              </Link>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={handleSubmit}
              className="flex flex-col gap-5"
            >
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Set new password</h2>
                <p className="text-sm text-muted-foreground">Choose a strong password (min. 8 characters).</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New password</label>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    autoFocus
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-12 rounded-2xl bg-background/50 border-border/60 pr-12"
                    required
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confirm password</label>
                <Input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="h-12 rounded-2xl bg-background/50 border-border/60"
                  required
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button type="submit" disabled={loading} className="w-full h-12 rounded-2xl font-bold">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
              </Button>

              <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </Link>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
