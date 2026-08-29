import { useState, useRef, useCallback, useEffect } from "react"
import { useAuth, useAuthActions } from "@/hooks/use-auth"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Eye, EyeOff, LogOut, Lock, User, CheckCircle2,
  Loader2, AlertCircle, Camera, Pencil, Mail, X, Save,
  Users, Plus, Trash2, UserCheck, ShieldOff, Linkedin,
  Send, Clock, ChevronDown,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  useListTeamMembers, useCreateTeamMember, useUpdateTeamMember,
  useDeleteTeamMember, getListTeamMembersQueryKey,
  useListProducts,
  type TeamMember,
} from "@workspace/api-client-react"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

// ── Avatar upload ────────────────────────────────────────────────────────────
function Avatar({
  src, name, uploading, onUpload
}: {
  src?: string | null
  name?: string | null
  uploading: boolean
  onUpload: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const initials = name
    ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  return (
    <div className="relative w-24 h-24 shrink-0">
      <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-border bg-primary/10 flex items-center justify-center">
        {src ? (
          <img src={`${BASE}/api${src}`} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl font-bold text-primary">{initials}</span>
        )}
      </div>

      {/* Upload overlay */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
        aria-label="Change photo"
      >
        {uploading
          ? <Loader2 className="w-6 h-6 text-white animate-spin" />
          : <Camera className="w-6 h-6 text-white" />
        }
      </button>

      {/* Tap badge (mobile) */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg border-2 border-background"
        aria-label="Change photo"
      >
        {uploading
          ? <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" />
          : <Camera className="w-3.5 h-3.5 text-primary-foreground" />
        }
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 px-1">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </h2>
      {children}
    </div>
  )
}

// ── Feedback banner ──────────────────────────────────────────────────────────
function Feedback({ error, success }: { error: string | null; success: string | null }) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </motion.div>
      )}
      {success && (
        <motion.div key="ok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 rounded-xl px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />{success}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth()
  const { logout } = useAuthActions()
  const qc = useQueryClient()

  // ── Photo upload state ──────────────────────────────────────────────────
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  // ── Profile form state ──────────────────────────────────────────────────
  const [editingProfile, setEditingProfile] = useState(false)
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [linkedinUrl, setLinkedinUrl] = useState((user as any)?.linkedinUrl ?? "")
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)

  // ── Password form state ─────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState<string | null>(null)

  // ── Photo upload ─────────────────────────────────────────────────────────
  const handlePhotoUpload = useCallback(async (file: File) => {
    setPhotoUploading(true)
    setPhotoError(null)
    try {
      // 1. Request presigned URL
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      })
      if (!urlRes.ok) throw new Error("Failed to get upload URL")
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string }

      // 2. Upload directly
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!putRes.ok) throw new Error("Upload failed")

      // 3. Save objectPath as profileImageUrl
      const patchRes = await fetch(`${BASE}/api/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileImageUrl: objectPath }),
      })
      if (!patchRes.ok) throw new Error("Failed to save photo")

      await qc.invalidateQueries({ queryKey: ["auth-user"] })
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setPhotoUploading(false)
    }
  }, [qc])

  // ── Profile save ─────────────────────────────────────────────────────────
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setProfileError("Name is required."); return }
    if (!email.trim()) { setProfileError("Email is required."); return }
    setProfileSaving(true); setProfileError(null); setProfileSuccess(null)
    try {
      const body: Record<string, string | null> = {}
      if (name.trim() !== (user?.name ?? "")) body.name = name.trim()
      if (email.trim() !== (user?.email ?? "")) body.email = email.trim()
      const currentLinkedin = (user as any)?.linkedinUrl ?? ""
      if (linkedinUrl.trim() !== currentLinkedin) body.linkedinUrl = linkedinUrl.trim() || null
      if (Object.keys(body).length === 0) {
        setEditingProfile(false); setProfileSaving(false); return
      }
      const res = await fetch(`${BASE}/api/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json() as { error?: string }
      if (!res.ok) throw new Error(d.error ?? "Failed to save")
      await qc.invalidateQueries({ queryKey: ["auth-user"] })
      setProfileSuccess("Profile updated.")
      setEditingProfile(false)
      setTimeout(() => setProfileSuccess(null), 4000)
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Password change ──────────────────────────────────────────────────────
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwError("New passwords don't match."); return }
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters."); return }
    setPwLoading(true); setPwError(null); setPwSuccess(null)
    try {
      const res = await fetch(`${BASE}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const d = await res.json() as { error?: string }
      if (!res.ok) throw new Error(d.error ?? "Failed to update password.")
      setPwSuccess("Password updated successfully.")
      setCurrentPw(""); setNewPw(""); setConfirmPw("")
      setTimeout(() => setPwSuccess(null), 5000)
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Network error — try again.")
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col pt-6 pb-28 lg:pb-10 space-y-8 px-4 overflow-y-auto">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>

      {/* ── Avatar + name header ────────────────────────────────────────── */}
      <div className="flex items-center gap-5">
        <Avatar
          src={user?.profileImageUrl}
          name={user?.name}
          uploading={photoUploading}
          onUpload={handlePhotoUpload}
        />
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold truncate">{user?.name ?? "Your name"}</p>
          <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
          {photoError && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{photoError}
            </p>
          )}
        </div>
      </div>

      {/* ── Personal information ─────────────────────────────────────────── */}
      <Section title="Personal Information" icon={User}>
        <Card>
          <CardContent className="p-5">
            <AnimatePresence mode="wait">
              {!editingProfile ? (
                /* Read-only view */
                <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Name</p>
                      <p className="text-sm font-semibold">{user?.name ?? <span className="text-muted-foreground italic">Not set</span>}</p>
                    </div>
                  </div>
                  <div className="border-t border-border" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Email</p>
                    <p className="text-sm font-semibold break-all">{user?.email}</p>
                  </div>
                  <div className="border-t border-border" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5 flex items-center gap-1.5">
                      <Linkedin className="w-3 h-3" /> LinkedIn
                    </p>
                    {(user as any)?.linkedinUrl ? (
                      <a
                        href={(user as any).linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-primary hover:underline break-all"
                      >
                        {(user as any).linkedinUrl}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Not set</p>
                    )}
                  </div>
                  <Feedback error={null} success={profileSuccess} />
                  <Button variant="outline" onClick={() => { setEditingProfile(true); setName(user?.name ?? ""); setEmail(user?.email ?? ""); setLinkedinUrl((user as any)?.linkedinUrl ?? "") }}
                    className="w-full h-10 rounded-xl gap-2 mt-1">
                    <Pencil className="w-3.5 h-3.5" />
                    Edit information
                  </Button>
                </motion.div>
              ) : (
                /* Edit form */
                <motion.form key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onSubmit={handleProfileSave} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Full name</label>
                    <Input value={name} onChange={e => setName(e.target.value)}
                      placeholder="Your name" className="h-11 rounded-xl" autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Mail className="w-3 h-3" />Email
                    </label>
                    <Input value={email} onChange={e => setEmail(e.target.value)}
                      type="email" placeholder="you@example.com" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Linkedin className="w-3 h-3" />LinkedIn URL
                    </label>
                    <Input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
                      type="url" placeholder="https://linkedin.com/in/yourname" className="h-11 rounded-xl" />
                  </div>
                  <Feedback error={profileError} success={null} />
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => { setEditingProfile(false); setProfileError(null) }}
                      className="flex-1 h-11 rounded-xl gap-2">
                      <X className="w-4 h-4" />Cancel
                    </Button>
                    <Button type="submit" disabled={profileSaving} className="flex-1 h-11 rounded-xl gap-2">
                      {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {profileSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </Section>

      {/* ── Change password ──────────────────────────────────────────────── */}
      <Section title="Change Password" icon={Lock}>
        <Card>
          <CardContent className="p-5">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Current password</label>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} autoComplete="current-password"
                    placeholder="••••••••" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                    className="h-11 rounded-xl pr-10" required />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">New password</label>
                <Input type={showPw ? "text" : "password"} autoComplete="new-password"
                  placeholder="Min. 8 characters" value={newPw} onChange={e => setNewPw(e.target.value)}
                  className="h-11 rounded-xl" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Confirm new password</label>
                <Input type={showPw ? "text" : "password"} autoComplete="new-password"
                  placeholder="Repeat new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  className="h-11 rounded-xl" required />
              </div>

              {/* Strength indicator */}
              {newPw.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", {
                        "bg-red-500": newPw.length >= i * 2 && newPw.length < 8,
                        "bg-amber-400": newPw.length >= 8 && i <= 2,
                        "bg-green-400": newPw.length >= 12 && i <= 3,
                        "bg-primary": newPw.length >= 16,
                        "bg-muted": newPw.length < i * 2,
                      })} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {newPw.length < 8 ? "Too short" : newPw.length < 12 ? "Good" : newPw.length < 16 ? "Strong" : "Very strong"}
                  </p>
                </div>
              )}

              <Feedback error={pwError} success={pwSuccess} />
              <Button type="submit" disabled={pwLoading} className="w-full h-11 rounded-xl gap-2">
                {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {pwLoading ? "Updating…" : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Section>

      {/* ── Outbound email limits ─────────────────────────────────────────── */}
      <EmailSendLimitsSection />

      {/* ── Team ─────────────────────────────────────────────────────────── */}
      <TeamSection />

      {/* ── Sign out ─────────────────────────────────────────────────────── */}
      <div className="pt-2">
        <Button variant="destructive" className="w-full h-12 rounded-2xl gap-2" onClick={logout}>
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>
    </div>
  )
}

// ── Team section ─────────────────────────────────────────────────────────────

const SUBSECTIONS = [
  { key: "intelligence", label: "Intelligence" },
  { key: "strategist",   label: "Strategist"   },
  { key: "documents",    label: "Documents"    },
  { key: "email",        label: "Email"        },
  { key: "social",       label: "Social"       },
] as const

// Extended types (server enriches team members with these fields)
interface PendingInvite { email: string; accountRole: string; expiresAt: string }
interface TeamMemberExt extends TeamMember {
  userId?: string | null
  inviteEmail?: string | null
  pendingInvite?: PendingInvite | null
}
interface ProductAssignmentRow { productId: number; permissions: string[] | null }

type EmailLimitSettings = {
  enabled: boolean
  dailyMax: number
  dailyMin: number | null
}

// ── Email send limits (org-wide, per team member) ─────────────────────────────
function EmailSendLimitsSection() {
  const { user } = useAuth()
  const isOwner = user?.role === "owner"
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState<EmailLimitSettings>({ enabled: false, dailyMax: 100, dailyMin: null })
  const [randomize, setRandomize] = useState(false)

  const limitsQuery = useQuery({
    queryKey: ["email-send-limits"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/settings/email-send-limits`, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load email limits")
      return res.json() as Promise<{
        settings: EmailLimitSettings
        myQuota: { enabled: boolean; allowed: number | null; sent: number; remaining: number | null }
      }>
    },
  })

  useEffect(() => {
    if (limitsQuery.data?.settings) {
      const s = limitsQuery.data.settings
      setForm(s)
      setRandomize(s.dailyMin != null && s.dailyMin < s.dailyMax)
    }
  }, [limitsQuery.data])

  const handleSave = async () => {
    if (!isOwner) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload: EmailLimitSettings = {
        enabled: form.enabled,
        dailyMax: form.dailyMax,
        dailyMin: randomize && form.dailyMin != null && form.dailyMin < form.dailyMax ? form.dailyMin : null,
      }
      const res = await fetch(`${BASE}/api/settings/email-send-limits`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      await qc.invalidateQueries({ queryKey: ["email-send-limits"] })
      setSuccess("Email limits saved.")
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const myQuota = limitsQuery.data?.myQuota

  return (
    <Section icon={Send} title="Outbound email limits">
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cap how many emails each team member can send per day. Large contact selections are spread across days automatically
            (e.g. 8,000 contacts at 100/day ≈ 80 days per member).
          </p>

          {limitsQuery.isLoading ? (
            <div className="h-16 bg-muted rounded-xl animate-pulse" />
          ) : (
            <>
              {myQuota?.enabled && (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
                  <span className="font-medium">Your quota today:</span>{" "}
                  {myQuota.sent} / {myQuota.allowed} sent
                  {myQuota.remaining != null && myQuota.remaining > 0 && (
                    <span className="text-muted-foreground"> · {myQuota.remaining} remaining</span>
                  )}
                </div>
              )}

              {isOwner ? (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                      className="rounded border-border"
                    />
                    Enable daily send limits for all team members
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Max emails per member / day</label>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        value={form.dailyMax}
                        onChange={(e) => setForm((f) => ({ ...f, dailyMax: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                        className="h-9 rounded-lg"
                        disabled={!form.enabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Min (optional)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={form.dailyMax}
                        value={randomize ? (form.dailyMin ?? "") : ""}
                        placeholder={randomize ? "e.g. 80" : "—"}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10)
                          setForm((f) => ({ ...f, dailyMin: Number.isFinite(v) ? v : null }))
                        }}
                        className="h-9 rounded-lg"
                        disabled={!form.enabled || !randomize}
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={randomize}
                      onChange={(e) => {
                        setRandomize(e.target.checked)
                        if (e.target.checked && !form.dailyMin) {
                          setForm((f) => ({ ...f, dailyMin: Math.max(1, Math.floor(f.dailyMax * 0.85)) }))
                        }
                      }}
                      disabled={!form.enabled}
                      className="rounded border-border"
                    />
                    Randomise each member&apos;s daily cap between min and max (varies per day, stable within the day)
                  </label>

                  <Feedback error={error} success={success} />
                  <Button onClick={handleSave} disabled={saving} className="w-full h-10 rounded-xl gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save email limits
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {form.enabled
                    ? `Limit active: up to ${form.dailyMax} emails per team member per day.`
                    : "Daily send limits are not enabled. Ask the account owner to configure them."}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Section>
  )
}

// ── TeamSection ───────────────────────────────────────────────────────────────
function TeamSection() {
  const qc = useQueryClient()
  const { data: members = [], isLoading } = useListTeamMembers()
  const createMember = useCreateTeamMember()
  const deleteMember = useDeleteTeamMember()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: "", role: "", focus: "", hoursPerWeek: "", email: "", accountRole: "member" as "member" | "admin" })
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState("")

  const handleAdd = async () => {
    if (!form.name.trim() || !form.role.trim()) return
    setSaving(true)
    setAddError("")
    try {
      const member = await createMember.mutateAsync({
        data: {
          name: form.name.trim(),
          role: form.role.trim(),
          focus: form.focus.trim() || undefined,
          hoursPerWeek: form.hoursPerWeek ? parseInt(form.hoursPerWeek) : undefined,
        }
      }) as TeamMemberExt & { id: number }
      if (form.email.trim() && member?.id) {
        const res = await fetch(`${BASE}/api/team/${member.id}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: form.email.trim(), accountRole: form.accountRole }),
        })
        if (!res.ok) {
          const data = await res.json() as { error?: string }
          setAddError(`Member added but invite failed: ${data.error ?? "Unknown error"}`)
          await qc.invalidateQueries({ queryKey: getListTeamMembersQueryKey() })
          return
        }
      }
      await qc.invalidateQueries({ queryKey: getListTeamMembersQueryKey() })
      setForm({ name: "", role: "", focus: "", hoursPerWeek: "", email: "", accountRole: "member" })
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await deleteMember.mutateAsync({ id })
    qc.invalidateQueries({ queryKey: getListTeamMembersQueryKey() })
  }

  const extMembers = members as TeamMemberExt[]

  return (
    <Section icon={Users} title="Team">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Invite team members, assign which products they can access, and control which sections of each product they can see.
          </p>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {extMembers.length === 0 && !adding && (
                <div className="text-center py-6">
                  <UserCheck className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No team members yet.</p>
                  <p className="text-xs text-muted-foreground">Add collaborators and send them an invite.</p>
                </div>
              )}
              {extMembers.map(m => (
                <TeamMemberCard
                  key={m.id}
                  member={m}
                  onDelete={() => handleDelete(m.id)}
                  onRefresh={() => qc.invalidateQueries({ queryKey: getListTeamMembersQueryKey() })}
                />
              ))}
            </div>
          )}

          <AnimatePresence>
            {adding && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="border border-primary/20 rounded-xl p-3 bg-primary/5 space-y-3"
              >
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-primary" />
                  New team member
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  <Input placeholder="Job title * (e.g. Sales Rep)" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  <Input placeholder="Focus area (optional)" value={form.focus} onChange={e => setForm(f => ({ ...f, focus: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  <Input placeholder="Hrs/week (optional)" type="number" min="1" max="168" value={form.hoursPerWeek} onChange={e => setForm(f => ({ ...f, hoursPerWeek: e.target.value }))} className="h-9 rounded-lg text-sm" />
                </div>
                <div className="border-t border-border/30 pt-2 space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Send invite (optional)</p>
                  <Input placeholder="Email address" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  {form.email.trim() && (
                    <div className="grid grid-cols-2 gap-2">
                      {(["member", "admin"] as const).map(r => (
                        <button key={r} type="button" onClick={() => setForm(f => ({ ...f, accountRole: r }))}
                          className={cn("rounded-lg border px-3 py-1.5 text-left transition-colors",
                            form.accountRole === r
                              ? r === "admin" ? "border-blue-400/50 bg-blue-400/10 text-blue-300" : "border-primary/50 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-border/80"
                          )}>
                          <p className="text-xs font-semibold capitalize">{r}</p>
                          <p className="text-[10px] opacity-70">{r === "admin" ? "Can edit revenue figures" : "Read-only access"}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {addError && <p className="text-xs text-amber-400">{addError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="flex-1 h-8 rounded-lg text-xs" onClick={() => { setAdding(false); setAddError("") }}>Cancel</Button>
                  <Button size="sm" className="flex-1 h-8 rounded-lg text-xs gap-1.5"
                    disabled={!form.name.trim() || !form.role.trim() || saving} onClick={handleAdd}>
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : form.email.trim() ? <Send className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                    {form.email.trim() ? "Add & send invite" : "Add member"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!adding && (
            <Button variant="outline" size="sm" className="w-full h-9 rounded-xl gap-2 border-dashed" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add team member
            </Button>
          )}
        </CardContent>
      </Card>
    </Section>
  )
}

// ── TeamMemberCard ────────────────────────────────────────────────────────────
function TeamMemberCard({ member, onDelete, onRefresh }: { member: TeamMemberExt; onDelete: () => void; onRefresh: () => void }) {
  const qc = useQueryClient()
  const updateMember = useUpdateTeamMember()
  const { data: allProducts = [] } = useListProducts()
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<"access" | "products" | "details">("access")
  const [form, setForm] = useState({ name: member.name, role: member.role, focus: member.focus ?? "", hoursPerWeek: member.hoursPerWeek?.toString() ?? "" })
  const [editSaving, setEditSaving] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: member.pendingInvite?.email ?? member.inviteEmail ?? "",
    accountRole: (member.pendingInvite?.accountRole ?? "member") as "member" | "admin",
  })
  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState("")
  const [inviteSaving, setInviteSaving] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [removingLogin, setRemovingLogin] = useState(false)
  const [assignmentError, setAssignmentError] = useState("")

  const hasAccount = !!member.userId
  const hasPendingInvite = !!member.pendingInvite

  // ── Product assignments (loaded when products tab is active) ──────────────
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<ProductAssignmentRow[]>({
    queryKey: ["team-product-assignments", member.userId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/product-assignments?userId=${encodeURIComponent(member.userId!)}`, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to fetch assignments")
      return res.json()
    },
    enabled: !!member.userId && expanded && activeTab === "products",
  })

  const invalidateAssignments = () => qc.invalidateQueries({ queryKey: ["team-product-assignments", member.userId] })

  const isAssigned = (productId: number) => assignments.some(a => a.productId === productId)
  const getPermissions = (productId: number): string[] | null =>
    assignments.find(a => a.productId === productId)?.permissions ?? null

  const handleToggleProduct = async (productId: number) => {
    if (!member.userId) return
    setAssignmentError("")
    try {
      const res = await fetch(`${BASE}/api/product-assignments`, {
        method: isAssigned(productId) ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId, userId: member.userId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? "Could not save product access")
      }
      await invalidateAssignments()
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Could not save product access")
    }
  }

  const handleToggleSubsection = async (productId: number, subsection: string) => {
    if (!member.userId) return
    const current = getPermissions(productId)
    let next: string[] | null
    if (current === null) {
      // All enabled → disable just this one
      next = SUBSECTIONS.map(s => s.key).filter(k => k !== subsection)
    } else if (current.includes(subsection)) {
      const without = current.filter(k => k !== subsection)
      if (without.length === 0) return // keep at least one section enabled
      next = without
    } else {
      const withIt = [...current, subsection]
      next = withIt.length === SUBSECTIONS.length ? null : withIt // null = all
    }
    setAssignmentError("")
    try {
      const res = await fetch(`${BASE}/api/product-assignments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId, userId: member.userId, permissions: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? "Could not save section access")
      }
      await invalidateAssignments()
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Could not save section access")
    }
  }

  // ── Details save ──────────────────────────────────────────────────────────
  const handleSaveDetails = async () => {
    setEditSaving(true)
    await updateMember.mutateAsync({
      id: member.id,
      data: {
        name: form.name.trim(),
        role: form.role.trim(),
        focus: form.focus.trim() || null,
        hoursPerWeek: form.hoursPerWeek ? parseInt(form.hoursPerWeek) : null,
      }
    })
    await qc.invalidateQueries({ queryKey: getListTeamMembersQueryKey() })
    setEditSaving(false)
  }

  // ── Invite actions ────────────────────────────────────────────────────────
  const handleSendInvite = async () => {
    if (!inviteForm.email.trim()) return
    setInviteError(""); setInviteSuccess(""); setInviteSaving(true)
    try {
      const res = await fetch(`${BASE}/api/team/${member.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteForm.email.trim(), accountRole: inviteForm.accountRole }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setInviteError(data.error ?? "Failed to send invite"); return }
      setInviteSuccess(hasPendingInvite ? "Invite resent!" : "Invite sent!")
      setTimeout(() => setInviteSuccess(""), 4000)
      onRefresh()
    } catch { setInviteError("Network error, please try again") }
    finally { setInviteSaving(false) }
  }

  const handleRevoke = async () => {
    if (!confirm(`Revoke the invite for ${member.name}?`)) return
    setRevoking(true)
    try {
      await fetch(`${BASE}/api/team/${member.id}/invite`, { method: "DELETE", credentials: "include" })
      onRefresh()
    } finally { setRevoking(false) }
  }

  const handleRemoveLogin = async () => {
    if (!confirm(`Remove ${member.name}'s login? They will no longer be able to sign in.`)) return
    setRemovingLogin(true)
    try {
      await fetch(`${BASE}/api/team/${member.id}/remove-account`, { method: "DELETE", credentials: "include" })
      onRefresh()
    } finally { setRemovingLogin(false) }
  }

  const initial = member.name.charAt(0).toUpperCase()

  return (
    <div className="rounded-xl bg-muted/40 border border-border/50 overflow-hidden">

      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 py-2.5 px-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">{initial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{member.name}</p>
            {hasAccount ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 shrink-0">Active</span>
            ) : hasPendingInvite ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 shrink-0 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />Invite pending
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/30 shrink-0">No login</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {member.role}{member.focus ? ` · ${member.focus}` : ""}{member.hoursPerWeek ? ` · ${member.hoursPerWeek}h/wk` : ""}
            {(hasPendingInvite || hasAccount) && member.inviteEmail ? ` · ${member.pendingInvite?.email ?? member.inviteEmail}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setExpanded(v => !v)}
            className={cn("p-1.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/60", expanded && "bg-muted/60 text-foreground")}>
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", expanded && "rotate-180")} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Expanded panels ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="border-t border-border/30"
          >
            {/* Tab bar */}
            <div className="flex border-b border-border/30 bg-muted/20">
              {(["access", "products", "details"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={cn("flex-1 py-2 text-xs font-medium transition-colors border-b-2",
                    activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}>
                  {tab === "access" ? "Invite & Access" : tab === "products" ? "Products" : "Details"}
                </button>
              ))}
            </div>

            {/* ── Access tab ────────────────────────────────────────────────── */}
            {activeTab === "access" && (
              <div className="p-3 space-y-3">
                {hasAccount ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-emerald-400">Account active</p>
                      {(member.inviteEmail) && <p className="text-[10px] text-muted-foreground truncate">{member.inviteEmail}</p>}
                    </div>
                    <button onClick={handleRemoveLogin} disabled={removingLogin}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                      {removingLogin ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldOff className="w-3 h-3" />}
                      Remove login
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {hasPendingInvite && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-400/5 border border-amber-400/20">
                        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-amber-400">Invite pending</p>
                          <p className="text-[10px] text-muted-foreground truncate">{member.pendingInvite!.email}</p>
                        </div>
                        <button onClick={handleRevoke} disabled={revoking}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                          {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          Revoke
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {hasPendingInvite ? "Resend a new link:" : "Send an invite so they can set their own password:"}
                    </p>
                    <Input placeholder="Email address" type="email" value={inviteForm.email}
                      onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                      className="h-9 rounded-lg text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      {(["member", "admin"] as const).map(r => (
                        <button key={r} type="button" onClick={() => setInviteForm(f => ({ ...f, accountRole: r }))}
                          className={cn("rounded-lg border px-3 py-1.5 text-left transition-colors",
                            inviteForm.accountRole === r
                              ? r === "admin" ? "border-blue-400/50 bg-blue-400/10 text-blue-300" : "border-primary/50 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-border/80"
                          )}>
                          <p className="text-xs font-semibold capitalize">{r}</p>
                          <p className="text-[10px] opacity-70">{r === "admin" ? "Can edit revenue figures" : "Read-only access"}</p>
                        </button>
                      ))}
                    </div>
                    {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
                    {inviteSuccess && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{inviteSuccess}</p>}
                    <Button size="sm" className="w-full h-8 rounded-lg text-xs gap-1.5"
                      disabled={!inviteForm.email.trim() || inviteSaving} onClick={handleSendInvite}>
                      {inviteSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      {hasPendingInvite ? "Resend invite" : "Send invite"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Products tab ──────────────────────────────────────────────── */}
            {activeTab === "products" && (
              <div className="p-3 space-y-2">
                {!member.userId ? (
                  <div className="text-center py-5 space-y-1">
                    <Send className="w-6 h-6 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs text-muted-foreground pt-1">
                      Send an invite first — product access can be configured once the member has an account.
                    </p>
                  </div>
                ) : assignmentsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
                  </div>
                ) : allProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No products yet.</p>
                ) : (
                  <>
                    {assignmentError && (
                      <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/5 px-2.5 py-2 text-xs text-red-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {assignmentError}
                      </div>
                    )}
                    <div className="space-y-2">
                      {allProducts.map(product => {
                        const assigned = isAssigned(product.id)
                        const perms = getPermissions(product.id)
                        return (
                          <div key={product.id} className={cn("rounded-lg border transition-colors", assigned ? "border-primary/30 bg-primary/5" : "border-border/50")}>
                            <button className="w-full flex items-center gap-3 px-3 py-2 text-left"
                              onClick={() => handleToggleProduct(product.id)}>
                              <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                assigned ? "border-primary bg-primary" : "border-border/60")}>
                                {assigned && <span className="text-primary-foreground text-[9px] font-bold leading-none">✓</span>}
                              </div>
                              <span className="text-sm font-medium flex-1 truncate">{product.name}</span>
                              {product.status && (
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border shrink-0",
                                  product.status === "active"
                                    ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                                    : "bg-muted text-muted-foreground border-border/30"
                                )}>{product.status}</span>
                              )}
                            </button>
                            {assigned && (
                              <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
                                {SUBSECTIONS.map(({ key, label }) => {
                                  const allowed = perms === null || perms.includes(key)
                                  return (
                                    <button key={key}
                                      onClick={() => handleToggleSubsection(product.id, key)}
                                      className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                                        allowed
                                          ? "border-primary/40 bg-primary/15 text-primary"
                                          : "border-border/40 bg-transparent text-muted-foreground hover:border-border/80"
                                      )}>
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-0.5">
                      Tick a product to grant access. Click section pills to control which areas they can see.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── Details tab ───────────────────────────────────────────────── */}
            {activeTab === "details" && (
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  <Input placeholder="Job title *" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  <Input placeholder="Focus area" value={form.focus} onChange={e => setForm(f => ({ ...f, focus: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  <Input placeholder="Hrs/week" type="number" value={form.hoursPerWeek} onChange={e => setForm(f => ({ ...f, hoursPerWeek: e.target.value }))} className="h-9 rounded-lg text-sm" />
                </div>
                <Button size="sm" className="w-full h-8 rounded-lg text-xs gap-1.5"
                  disabled={!form.name.trim() || !form.role.trim() || editSaving} onClick={handleSaveDetails}>
                  {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save details
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
