import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, KeyRound, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

export default function AcceptInvitePage() {
  const [, navigate] = useLocation()
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Parse token from query string
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get("token")
    if (t) setToken(t)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/api/team/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json() as { error?: string; user?: unknown }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.")
        return
      }
      setSuccess(true)
      // Give the user a moment to see success then redirect
      setTimeout(() => {
        window.location.href = BASE + "/"
      }, 1500)
    } catch {
      setError("Network error — please try again.")
    } finally {
      setLoading(false)
    }
  }

  const strength = password.length === 0 ? 0
    : password.length < 8 ? 1
    : password.length < 12 ? 2
    : password.length < 16 ? 3
    : 4

  if (!token) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Invalid invite link</h1>
          <p className="text-sm text-muted-foreground">This link is missing a token. Please use the link from your invitation email.</p>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate("/")}>
            Go to sign in
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / brand */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Accept your invitation</h1>
          <p className="text-sm text-muted-foreground">Set a password to activate your Closer account.</p>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
            <p className="text-sm font-semibold text-green-400">Account created — signing you in…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">New password</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-11 rounded-xl pr-10"
                  required
                  autoFocus
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

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="space-y-1 pt-0.5">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", {
                        "bg-red-500": strength === 1 && i === 1,
                        "bg-amber-400": strength === 2 && i <= 2,
                        "bg-green-400": strength === 3 && i <= 3,
                        "bg-primary": strength === 4,
                        "bg-muted": i > strength,
                      })} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {strength === 1 ? "Too short" : strength === 2 ? "Good" : strength === 3 ? "Strong" : "Very strong"}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Confirm password</label>
              <Input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="h-11 rounded-xl"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || password.length < 8}
              className="w-full h-11 rounded-xl gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {loading ? "Creating account…" : "Create my account"}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
