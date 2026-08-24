import { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TrendingUp, Fingerprint, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react"
import { browserSupportsWebAuthn, attemptBiometricLogin } from "@/hooks/use-webauthn"
import { AUTH_QUERY_KEY } from "@/hooks/use-auth"
import { Link } from "wouter"
import { motion, AnimatePresence } from "framer-motion"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export default function LoginPage() {
  const qc = useQueryClient()
  const supportsWebAuthn = browserSupportsWebAuthn()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [biometricState, setBiometricState] = useState<"idle" | "trying" | "failed">("idle")

  const emailRef = useRef<HTMLInputElement>(null)

  // Auto-attempt biometric on load (silent fail)
  useEffect(() => {
    if (!supportsWebAuthn) return
    setBiometricState("trying")
    attemptBiometricLogin()
      .then(result => {
        if (result.success) {
          qc.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
        } else {
          setBiometricState("idle")
        }
      })
      .catch(() => setBiometricState("idle"))
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json() as { user?: unknown; error?: string }
      if (!res.ok) {
        setError(data.error ?? "Login failed.")
      } else {
        qc.setQueryData(AUTH_QUERY_KEY, data.user)
      }
    } catch {
      setError("Network error — try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleBiometric = () => {
    setBiometricState("trying")
    attemptBiometricLogin()
      .then(result => {
        if (result.success) {
          qc.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
        } else {
          setBiometricState("failed")
        }
      })
      .catch(() => setBiometricState("failed"))
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 mb-10"
      >
        <div className="bg-primary/15 rounded-3xl p-5">
          <TrendingUp className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-foreground">Sales Manager</h1>
          <p className="text-muted-foreground text-sm mt-1 font-medium">Your sales command center</p>
        </div>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm bg-card rounded-3xl border border-border/30 p-8 flex flex-col gap-5"
      >
        <AnimatePresence mode="wait">
          {biometricState === "trying" ? (
            <motion.div
              key="biometric"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <div className="bg-primary/10 rounded-full p-4">
                <Fingerprint className="w-10 h-10 text-primary animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Checking biometrics…</p>
                <p className="text-xs text-muted-foreground mt-1">Use Face ID or fingerprint if prompted</p>
              </div>
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => setBiometricState("idle")}
              >
                Use email instead
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleLogin}
              className="flex flex-col gap-4"
            >
              <div className="text-center mb-1">
                <h2 className="text-xl font-bold text-foreground">Sign in</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Enter your email and password</p>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
                <Input
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-12 rounded-2xl bg-background/50 border-border/60 text-foreground"
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password</label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-12 rounded-2xl bg-background/50 border-border/60 text-foreground pr-12"
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
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

              {/* Login button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-2xl text-sm font-bold"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
              </Button>

              {/* Biometric */}
              {supportsWebAuthn && (
                <button
                  type="button"
                  onClick={handleBiometric}
                  className="w-full h-12 rounded-2xl text-sm font-bold border border-primary/30 text-primary flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors"
                >
                  <Fingerprint className="w-4 h-4" />
                  {biometricState === "failed" ? "Retry biometrics" : "Sign in with biometrics"}
                </button>
              )}

              {biometricState === "failed" && (
                <p className="text-xs text-destructive text-center -mt-2">
                  Biometric check failed — use your password above.
                </p>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>

      <p className="mt-8 text-center text-xs text-muted-foreground max-w-xs leading-relaxed">
        90% of your time on selling. The rest gets delegated, deferred, or deleted.
      </p>
    </div>
  )
}
