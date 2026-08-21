/**
 * Social media content automation tab for the product detail page.
 */
import { useState, useRef, useEffect, useCallback } from "react"
import { StylePickerDialog } from "@/components/style-picker-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Loader2, Instagram, Linkedin, Calendar, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, RefreshCw, Send, Settings, ExternalLink,
  Sparkles, X, Pencil, Check, AlertCircle, Upload, Link, FileText, ImagePlus,
  LayoutGrid, Trash2,
} from "lucide-react"
import {
  useSocialPosts, useApproveSocialPost,
  useRejectSocialPost, useRegenerateSocialPost, useUpdateSocialPost,
  usePostNow, useSocialAccounts, useSaveAccount, useDisconnectAccount,
  useMoveSocialPost, useUploadPostImage, useUploadPostDocument,
  useSocialAuthConfig, useGenerationStatus, useResumeImages, useStopGeneration,
  useSavedStyle, useClearSavedStyle, useDeleteSocialPost, useDeleteMonthPosts,
  type SocialPost,
} from "@/hooks/use-social-posts"
import { useGeneration } from "@/contexts/generation-context"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

// ── helpers ──────────────────────────────────────────────────────────────────

function formatMonth(ym: string) {
  const [y, m] = ym.split("-")
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" })
}

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function addMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}

function firstWeekdayOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).getDay()
}

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  approved:         "bg-blue-500/20 text-blue-300 border-blue-500/30",
  posted:           "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  failed:           "bg-red-500/20 text-red-300 border-red-500/30",
  rejected:         "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
}

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending",
  approved:         "Approved",
  posted:           "Posted",
  failed:           "Failed",
  rejected:         "Rejected",
}

// ── Post detail drawer ────────────────────────────────────────────────────────
function PostDrawer({ post, onClose }: { post: SocialPost; onClose: () => void }) {
  const approve        = useApproveSocialPost()
  const reject         = useRejectSocialPost()
  const regenerate     = useRegenerateSocialPost()
  const update         = useUpdateSocialPost()
  const postNow        = usePostNow()
  const move           = useMoveSocialPost()
  const uploadImage    = useUploadPostImage()
  const uploadDocument = useUploadPostDocument()

  const [editing,    setEditing]   = useState(false)
  const [caption,    setCaption]   = useState(post.caption  || "")
  const [hashtags,   setHashtags]  = useState(post.hashtags || "")
  const [videoUrl,   setVideoUrl]  = useState(post.videoUrl || "")
  const [editVideo,  setEditVideo] = useState(false)
  const [newTheme,   setNewTheme]  = useState("")

  const busy    = approve.isPending || reject.isPending || regenerate.isPending ||
                  update.isPending  || postNow.isPending || move.isPending ||
                  uploadImage.isPending || uploadDocument.isPending
  const isIG    = post.platform === "instagram"
  const Icon    = isIG ? Instagram : Linkedin
  const iconColor = isIG ? "text-[#E1306C]" : "text-[#0A66C2]"
  const iconBg    = isIG ? "bg-[#E1306C]/10" : "bg-[#0A66C2]/10"
  const canAct  = post.status !== "posted"

  const handleSave = async () => {
    await update.mutateAsync({ id: post.id, caption, hashtags })
    setEditing(false)
  }

  const handleSaveVideo = async () => {
    await update.mutateAsync({ id: post.id, caption: post.caption || "", hashtags: post.hashtags || "", videoUrl: videoUrl || null })
    setEditVideo(false)
  }

  const handleRegenerate = () => {
    regenerate.mutate({ id: post.id, theme: newTheme || undefined })
    setNewTheme("")
  }

  const handleMove = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value
    if (!date) return
    await move.mutateAsync({ id: post.id, date })
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadImage.mutate({ id: post.id, file })
    e.target.value = ""
  }

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadDocument.mutate({ id: post.id, file })
    e.target.value = ""
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/30 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/20">
          <div className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", iconBg)}>
              <Icon className={cn("w-4 h-4", iconColor)} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground capitalize">{post.platform}</p>
              {canAct ? (
                <label className="flex items-center gap-1 cursor-pointer group">
                  <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    {new Date(post.scheduledDate + "T00:00:00").toLocaleDateString("en-GB", {
                      weekday: "short", day: "numeric", month: "short",
                    })}
                  </span>
                  <Pencil className="w-2.5 h-2.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  <input type="date" defaultValue={post.scheduledDate} onChange={handleMove} className="sr-only" />
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {new Date(post.scheduledDate + "T00:00:00").toLocaleDateString("en-GB", {
                    weekday: "short", day: "numeric", month: "short",
                  })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {move.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
            <Badge className={cn("text-xs border", STATUS_COLORS[post.status])}>
              {STATUS_LABELS[post.status]}
            </Badge>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="px-5 pt-4">
          <div className="relative rounded-xl overflow-hidden bg-black/40 border border-border/20 aspect-square max-h-64 w-full">
            {uploadImage.isPending ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-xs">Uploading image…</p>
              </div>
            ) : post.imageUrl ? (
              <img src={post.imageUrl} alt="Post visual" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Sparkles className="w-8 h-8 animate-pulse" />
                <p className="text-xs">Generating image…</p>
              </div>
            )}
            {/* Posted link */}
            {post.status === "posted" && post.postUrl && (
              <a
                href={post.postUrl} target="_blank" rel="noopener noreferrer"
                className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-black/80"
              >
                <ExternalLink className="w-3 h-3" /> View post
              </a>
            )}
            {/* Replace image button */}
            {canAct && !uploadImage.isPending && (
              <label className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 hover:bg-black/90 text-white text-xs px-2 py-1.5 rounded-lg cursor-pointer transition-colors">
                <ImagePlus className="w-3 h-3" />
                Replace
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageUpload} className="sr-only" />
              </label>
            )}
          </div>
        </div>

        {/* Theme chip */}
        {post.theme && (
          <div className="px-5 pt-3">
            <span className="text-[10px] text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full font-medium">
              {post.theme}
            </span>
          </div>
        )}

        {/* Caption */}
        <div className="px-5 pt-3 pb-2">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={4}
                className="w-full bg-muted/40 border border-border/30 rounded-xl px-3 py-2 text-sm text-foreground resize-none outline-none focus:border-primary/50"
              />
              <input
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                placeholder="#hashtags"
                className="w-full bg-muted/40 border border-border/30 rounded-xl px-3 py-2 text-sm text-muted-foreground outline-none focus:border-primary/50"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={update.isPending} className="flex-1">
                  {update.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="group relative">
              <p className="text-sm text-foreground leading-relaxed">{post.caption}</p>
              {post.hashtags && <p className="text-xs text-primary/60 mt-1.5">{post.hashtags}</p>}
              {canAct && (
                <button
                  onClick={() => setEditing(true)}
                  className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Video link */}
        {canAct && (
          <div className="px-5 pb-2">
            {editVideo ? (
              <div className="flex gap-2 items-center">
                <input
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="Paste video URL (YouTube, Vimeo, Reel…)"
                  className="flex-1 bg-muted/40 border border-border/30 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
                />
                <Button size="sm" onClick={handleSaveVideo} disabled={update.isPending} className="shrink-0">
                  {update.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditVideo(false); setVideoUrl(post.videoUrl || "") }} className="shrink-0">
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : post.videoUrl ? (
              <div className="flex items-center gap-2 bg-muted/40 border border-border/20 rounded-lg px-3 py-1.5">
                <Link className="w-3 h-3 text-primary/60 shrink-0" />
                <a href={post.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary truncate flex-1 hover:underline">
                  {post.videoUrl}
                </a>
                <button onClick={() => setEditVideo(true)} className="text-muted-foreground hover:text-foreground shrink-0">
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditVideo(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Link className="w-3 h-3" /> Add video link
              </button>
            )}
          </div>
        )}

        {/* LinkedIn PDF upload */}
        {canAct && !isIG && (
          <div className="px-5 pb-3">
            {uploadDocument.isPending ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Uploading PDF…
              </div>
            ) : post.documentUrl ? (
              <div className="flex items-center gap-2 bg-muted/40 border border-border/20 rounded-lg px-3 py-1.5">
                <FileText className="w-3 h-3 text-primary/60 shrink-0" />
                <span className="text-xs text-foreground flex-1">PDF document attached</span>
                <label className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
                  <Upload className="w-3 h-3" />
                  <input type="file" accept="application/pdf" onChange={handleDocumentUpload} className="sr-only" />
                </label>
              </div>
            ) : (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                <FileText className="w-3 h-3" /> Attach PDF (LinkedIn carousel)
                <input type="file" accept="application/pdf" onChange={handleDocumentUpload} className="sr-only" />
              </label>
            )}
          </div>
        )}

        {/* Error */}
        {post.errorMessage && (
          <div className="mx-5 mb-3 flex items-start gap-2 bg-red-500/10 text-red-400 text-xs px-3 py-2 rounded-lg border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {post.errorMessage}
          </div>
        )}

        {/* Actions */}
        {canAct && (
          <div className="px-5 pb-5 pt-2 flex flex-wrap gap-2">
            {post.status === "pending_approval" && (
              <>
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                  disabled={busy}
                  onClick={() => approve.mutate(post.id)}
                >
                  {approve.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  disabled={busy}
                  onClick={() => reject.mutate(post.id)}
                >
                  {reject.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                  Reject
                </Button>
              </>
            )}
            {post.status === "approved" && (
              <Button
                size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white border-0"
                disabled={busy || (!post.imageUrl && !post.videoUrl && !post.documentUrl)}
                onClick={() => postNow.mutate(post.id)}
              >
                {postNow.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Post Now
              </Button>
            )}
            {/* Theme override + regenerate */}
            <div className="w-full space-y-1.5 pt-1 border-t border-border/15">
              <p className="text-[10px] text-muted-foreground">Change topic before regenerating (optional)</p>
              <div className="flex gap-2">
                <input
                  value={newTheme}
                  onChange={e => setNewTheme(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !busy && handleRegenerate()}
                  placeholder={post.theme || "e.g. customer success story, pricing, tips…"}
                  className="flex-1 bg-muted/40 border border-border/30 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground/40"
                />
                <Button size="sm" variant="outline" disabled={busy} onClick={handleRegenerate} className="shrink-0">
                  {regenerate.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Regenerate
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Connect accounts panel ────────────────────────────────────────────────────
function ConnectAccountsPanel({ productId }: { productId: number }) {
  const { data }       = useSocialAccounts(productId)
  const { data: oauthConfig } = useSocialAuthConfig()
  const save           = useSaveAccount(productId)
  const disconnect     = useDisconnectAccount(productId)

  const [showManual, setShowManual] = useState<"instagram" | "linkedin" | null>(null)
  const [form, setForm]             = useState({ accessToken: "", accountId: "", accountName: "" })

  const accounts  = data?.accounts ?? []
  const instagram = accounts.find(a => a.platform === "instagram")
  const linkedin  = accounts.find(a => a.platform === "linkedin")

  const handleSave = async (platform: "instagram" | "linkedin") => {
    await save.mutateAsync({ platform, ...form })
    setShowManual(null)
    setForm({ accessToken: "", accountId: "", accountName: "" })
  }

  function AccountRow({
    platform,
    account,
  }: {
    platform: "instagram" | "linkedin"
    account: ReturnType<typeof accounts.find>
  }) {
    const isIG     = platform === "instagram"
    const Icon     = isIG ? Instagram : Linkedin
    const color    = isIG ? "text-[#E1306C]" : "text-[#0A66C2]"
    const bg       = isIG ? "bg-[#E1306C]/10" : "bg-[#0A66C2]/10"
    const label    = isIG ? "Instagram Business" : "LinkedIn Company Page"
    const hasOAuth = isIG ? !!oauthConfig?.instagram : !!oauthConfig?.linkedin

    // OAuth initiation URL — full-page navigation to backend
    const oauthHref = `${BASE}/api/social-auth/${isIG ? "facebook" : "linkedin"}?productId=${productId}`

    return (
      <div className="p-4 rounded-xl bg-muted/30 border border-border/20 space-y-0">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", bg)}>
              <Icon className={cn("w-4 h-4", color)} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              {account?.connected
                ? <p className="text-xs text-emerald-400">Connected{account.accountName ? ` · ${account.accountName}` : ""}</p>
                : <p className="text-xs text-muted-foreground">Not connected</p>
              }
            </div>
          </div>
          {account?.connected && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => disconnect.mutate(platform)}
            >
              Disconnect
            </Button>
          )}
        </div>

        {/* Connect / reconnect area */}
        {!account?.connected && (
          <div className="mt-3 space-y-2">
            {hasOAuth ? (
              // ── OAuth login button ──────────────────────────────────────────
              <>
                <a
                  href={oauthHref}
                  className={cn(
                    "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-colors",
                    isIG
                      ? "bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white hover:opacity-90"
                      : "bg-[#0A66C2] text-white hover:bg-[#004182]",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {isIG ? "Log in with Facebook" : "Sign in with LinkedIn"}
                </a>
                <button
                  onClick={() => {
                    setShowManual(showManual === platform ? null : platform)
                    setForm({ accessToken: "", accountId: "", accountName: "" })
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline w-full text-center"
                >
                  {showManual === platform ? "Hide manual entry" : "Enter token manually instead"}
                </button>
              </>
            ) : (
              // ── No OAuth configured — show setup hint ───────────────────────
              <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 p-3 space-y-2">
                <p className="text-[11px] text-amber-400 font-medium">
                  {isIG ? "Facebook app credentials not configured" : "LinkedIn app credentials not configured"}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {isIG
                    ? "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to enable one-click login."
                    : "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to enable one-click login."}
                </p>
                <button
                  onClick={() => {
                    setShowManual(showManual === platform ? null : platform)
                    setForm({ accessToken: "", accountId: "", accountName: "" })
                  }}
                  className="text-[11px] text-primary hover:text-primary/80 transition-colors underline-offset-2 hover:underline"
                >
                  {showManual === platform ? "Hide manual entry" : "Enter token manually"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Re-connect button when already connected */}
        {account?.connected && (
          <div className="mt-2">
            {hasOAuth ? (
              <a
                href={oauthHref}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                Re-authenticate with {isIG ? "Facebook" : "LinkedIn"}
              </a>
            ) : (
              <button
                onClick={() => {
                  setShowManual(showManual === platform ? null : platform)
                  setForm({ accessToken: "", accountId: "", accountName: "" })
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                {showManual === platform ? "Hide" : "Update token manually"}
              </button>
            )}
          </div>
        )}

        {/* Manual token entry form */}
        {showManual === platform && (
          <div className="mt-3 space-y-2 border-t border-border/20 pt-3">
            <input
              placeholder={isIG ? "Instagram Business Account ID (numeric)" : "LinkedIn Organization ID or URN"}
              value={form.accountId}
              onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
              className="w-full bg-muted/40 border border-border/30 rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50"
            />
            <input
              placeholder="Display name (optional)"
              value={form.accountName}
              onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))}
              className="w-full bg-muted/40 border border-border/30 rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50"
            />
            <input
              type="password"
              placeholder="Access token"
              value={form.accessToken}
              onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))}
              className="w-full bg-muted/40 border border-border/30 rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50"
            />
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1"
                disabled={!form.accessToken || !form.accountId || save.isPending}
                onClick={() => handleSave(platform)}
              >
                {save.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => setShowManual(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Connect your social accounts to enable auto-posting. Approved posts for today are posted automatically at 9 AM.
      </p>
      <AccountRow platform="instagram" account={instagram} />
      <AccountRow platform="linkedin"  account={linkedin}  />
    </div>
  )
}

// ── Generate Schedule dropdown button ─────────────────────────────────────────
function GenerateScheduleButton({
  isPending,
  currentMonth,
  onGenerate,
}: {
  isPending: boolean
  currentMonth: string
  onGenerate: (startDate: string, navigateTo?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const nextMonth = addMonth(currentMonth, 1)

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center">
        <Button
          size="sm"
          onClick={() => { onGenerate(`${currentMonth}-01`); setOpen(false) }}
          disabled={isPending}
          className="rounded-r-none bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 border-r-0"
        >
          {isPending
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            : <><Sparkles className="w-3.5 h-3.5" /> Generate Schedule</>}
        </Button>
        <button
          disabled={isPending}
          onClick={() => setOpen(o => !o)}
          className="h-8 px-1.5 rounded-r-md bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 border-l border-l-primary/20 disabled:opacity-50 transition-colors flex items-center"
          aria-label="Choose month"
        >
          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", open ? "-rotate-90" : "rotate-90")} />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-popover border border-border/30 rounded-xl shadow-2xl overflow-hidden z-40">
          <button
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
            onClick={() => { onGenerate(`${currentMonth}-01`); setOpen(false) }}
          >
            <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
            <div>
              <p className="font-medium leading-none mb-0.5">This month</p>
              <p className="text-[10px] text-muted-foreground">{formatMonth(currentMonth)}</p>
            </div>
          </button>
          <div className="border-t border-border/15" />
          <button
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
            onClick={() => { onGenerate(`${nextMonth}-01`, nextMonth); setOpen(false) }}
          >
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <div>
              <p className="font-medium leading-none mb-0.5">Next month</p>
              <p className="text-[10px] text-muted-foreground">{formatMonth(nextMonth)}</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Large post card ───────────────────────────────────────────────────────────
function PostCard({ post, onClick }: { post: SocialPost; onClick: () => void }) {
  const approve    = useApproveSocialPost()
  const reject     = useRejectSocialPost()
  const deletePost = useDeleteSocialPost()
  const isIG    = post.platform === "instagram"
  const Icon    = isIG ? Instagram : Linkedin
  const iconColor = isIG ? "text-[#E1306C]" : "text-[#0A66C2]"
  const iconBg    = isIG ? "bg-[#E1306C]/15" : "bg-[#0A66C2]/15"
  const busy      = approve.isPending || reject.isPending || deletePost.isPending

  return (
    <div className="bg-muted/20 border border-border/20 rounded-xl overflow-hidden hover:border-border/40 transition-all flex flex-col">
      {/* Image */}
      <div className="relative aspect-square cursor-pointer group" onClick={onClick}>
        {post.imageUrl ? (
          <img src={post.imageUrl} alt={post.theme ?? "Post visual"} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/8 via-transparent to-primary/5 flex flex-col items-center justify-center gap-2">
            <Sparkles className="w-7 h-7 animate-pulse text-primary/30" />
            <p className="text-[10px] text-muted-foreground/60">Generating image…</p>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="text-xs text-white font-medium bg-black/60 px-3 py-1 rounded-full">View details</span>
        </div>
        {/* Platform badge */}
        <div className={cn("absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center", iconBg, "backdrop-blur-sm border border-white/10")}>
          <Icon className={cn("w-3.5 h-3.5", iconColor)} />
        </div>
        {/* Status badge */}
        <div className="absolute top-2 right-2">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium backdrop-blur-sm", STATUS_COLORS[post.status])}>
            {STATUS_LABELS[post.status]}
          </span>
        </div>
        {/* Theme on image bottom */}
        {post.theme && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 py-2">
            <p className="text-[10px] text-white/80 font-medium truncate">{post.theme}</p>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <p className="text-[10px] text-muted-foreground">
            {new Date(post.scheduledDate + "T00:00:00").toLocaleDateString("en-GB", {
              weekday: "short", day: "numeric", month: "short",
            })}
          </p>
          <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3 mt-0.5">
            {post.caption ?? ""}
          </p>
          {post.hashtags && (
            <p className="text-[10px] text-primary/50 mt-1 line-clamp-1">{post.hashtags}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 mt-auto pt-1">
          {post.status === "pending_approval" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={e => { e.stopPropagation(); approve.mutate(post.id) }}
                className="flex-1 h-7 text-[11px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/20 gap-1"
              >
                {approve.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={e => { e.stopPropagation(); reject.mutate(post.id) }}
                className="flex-1 h-7 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 gap-1"
              >
                {reject.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                Reject
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={e => {
              e.stopPropagation()
              if (window.confirm("Delete this post?")) deletePost.mutate(post.id)
            }}
            className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 ml-auto"
            title="Delete post"
          >
            {deletePost.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProductSocialTab({ productId, productName = "Product" }: { productId: number; productName?: string }) {
  const [month,        setMonth]        = useState(currentYM)
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)
  const [tab,          setTab]          = useState<"calendar" | "accounts">("calendar")
  const [filter,       setFilter]       = useState<"all" | "instagram" | "linkedin">("all")
  const [viewMode,     setViewMode]     = useState<"cards" | "calendar">("cards")

  const { toast }      = useToast()
  const qc             = useQueryClient()
  const resumeImages   = useResumeImages(productId)
  const stopGeneration = useStopGeneration(productId)
  const deleteMonth    = useDeleteMonthPosts(productId)
  // Guard: only auto-resume once per page load so we don't drain credits on repeated failures
  const hasAutoResumedRef = useRef(false)

  // Handle OAuth callback query params (?connected=linkedin|instagram  or  ?oauth_error=...)
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search)
    const connected  = params.get("connected")
    const oauthError = params.get("oauth_error")

    if (connected === "linkedin" || connected === "instagram") {
      setTab("accounts")
      qc.invalidateQueries({ queryKey: ["social-accounts", productId] })
      toast({
        title: `${connected === "linkedin" ? "LinkedIn" : "Instagram"} connected!`,
        description: "Your account is ready. Posts will publish automatically when approved.",
      })
      const url = new URL(window.location.href)
      url.searchParams.delete("connected")
      window.history.replaceState({}, "", url.toString())
    }

    if (oauthError) {
      setTab("accounts")
      toast({
        title: "Connection failed",
        description: decodeURIComponent(oauthError).replace(/_/g, " "),
        variant: "destructive",
      })
      const url = new URL(window.location.href)
      url.searchParams.delete("oauth_error")
      window.history.replaceState({}, "", url.toString())
    }
  }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading }           = useSocialPosts(productId, month)
  const { startGeneration, isGeneratingFor } = useGeneration()
  const isGenerating = isGeneratingFor(productId)
  const { user } = useAuth()
  const isOwner = user?.role === "owner"

  // Saved style — pre-populates the style picker next time
  const { data: savedStyleData, isLoading: savedStyleLoading } = useSavedStyle(productId)
  const clearSavedStyle = useClearSavedStyle(productId)

  // Style picker: hold the pending generate args until the user picks a style
  const [pendingGenerate, setPendingGenerate] = useState<{
    startDate: string
    navigateTo?: string
  } | null>(null)

  const handleGenerate = useCallback((startDate: string, navigateTo?: string) => {
    setPendingGenerate({ startDate, navigateTo })
  }, [])

  const handleStyleConfirm = useCallback(
    (styleGuide: string | undefined, stylePreset: string | undefined, selectedAssetUrls: string[]) => {
      if (!pendingGenerate) return
      const { startDate, navigateTo } = pendingGenerate
      setPendingGenerate(null)
      startGeneration(productId, productName, startDate, `/products/${productId}/social`, styleGuide, stylePreset, selectedAssetUrls)
      if (navigateTo) setMonth(navigateTo)
    },
    [pendingGenerate, startGeneration, productId, productName],
  )

  const handleClearSavedStyle = useCallback(() => {
    clearSavedStyle.mutate()
  }, [clearSavedStyle])

  const posts = data?.posts ?? []

  const byDate: Record<string, SocialPost[]> = {}
  for (const p of posts) {
    if (filter !== "all" && p.platform !== filter) continue
    if (!byDate[p.scheduledDate]) byDate[p.scheduledDate] = []
    byDate[p.scheduledDate].push(p)
  }

  const totalDays    = daysInMonth(month)
  const firstWeekday = firstWeekdayOfMonth(month)

  const igPosts   = posts.filter(p => p.platform === "instagram")
  const liPosts   = posts.filter(p => p.platform === "linkedin")
  const approved  = posts.filter(p => p.status === "approved").length
  const posted    = posts.filter(p => p.status === "posted").length
  const pending   = posts.filter(p => p.status === "pending_approval").length
  const generating = posts.some(p => !p.imageUrl && p.status === "pending_approval")

  // Poll generation status while images are pending — drives the banner and auto-resume
  const { data: imageStatus } = useGenerationStatus(productId, generating)

  // Auto-resume image generation if posts need images but no job is running.
  // This handles server restarts that killed the in-progress background loop.
  // The ref ensures we only fire once per page load — not on every failed retry.
  useEffect(() => {
    if (
      generating &&
      imageStatus !== undefined &&
      !imageStatus.active &&
      imageStatus.hasPendingImages &&
      !imageStatus.error &&          // don't auto-retry if the last run completely failed
      !resumeImages.isPending &&
      !hasAutoResumedRef.current
    ) {
      hasAutoResumedRef.current = true
      resumeImages.mutate()
    }
  }, [generating, imageStatus?.active, imageStatus?.hasPendingImages, imageStatus?.error]) // eslint-disable-line react-hooks/exhaustive-deps

  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, dateStr: `${month}-${String(d).padStart(2, "0")}` })
  }

  function PlatformChip({ post }: { post: SocialPost }) {
    const isIG = post.platform === "instagram"
    return (
      <button
        onClick={e => { e.stopPropagation(); setSelectedPost(post) }}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors w-full truncate border",
          STATUS_COLORS[post.status],
        )}
      >
        {isIG
          ? <Instagram className="w-2.5 h-2.5 shrink-0" />
          : <Linkedin  className="w-2.5 h-2.5 shrink-0" />}
        <span className="truncate">{STATUS_LABELS[post.status]}</span>
      </button>
    )
  }

  return (
    <div className="space-y-5">
      {/* Tab nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(["calendar", "accounts"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "calendar" ? <Calendar className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
              {t === "calendar" ? "Calendar" : "Accounts"}
            </button>
          ))}
        </div>
        {tab === "calendar" && (
          <div className="flex items-center gap-2">
            {posts.length > 0 && (
              <div className="flex items-center bg-muted/40 rounded-lg border border-border/20 p-0.5 gap-0.5">
                <button
                  onClick={() => setViewMode("cards")}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors",
                    viewMode === "cards"
                      ? "bg-muted/60 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <LayoutGrid className="w-3 h-3" />Cards
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors",
                    viewMode === "calendar"
                      ? "bg-muted/60 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Calendar className="w-3 h-3" />Calendar
                </button>
              </div>
            )}
            <GenerateScheduleButton
              isPending={isGenerating}
              currentMonth={month}
              onGenerate={handleGenerate}
            />
          </div>
        )}
      </div>

      {/* Accounts panel */}
      {tab === "accounts" && <ConnectAccountsPanel productId={productId} />}

      {/* Calendar */}
      {tab === "calendar" && (
        <>
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMonth(m => addMonth(m, -1))}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-foreground min-w-[160px] text-center">
                {formatMonth(month)}
              </span>
              <button
                onClick={() => setMonth(m => addMonth(m, 1))}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              {posts.length > 0 && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-yellow-400">{pending} pending</span>
                  <span className="text-blue-400">{approved} approved</span>
                  <span className="text-emerald-400">{posted} posted</span>
                </div>
              )}
              {posts.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteMonth.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete all ${posts.length} posts for ${formatMonth(month)}? This cannot be undone.`)) {
                      deleteMonth.mutate(month)
                    }
                  }}
                  className="h-7 px-2 text-[11px] text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 gap-1"
                >
                  {deleteMonth.isPending
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />}
                  Delete month
                </Button>
              )}
            </div>
          </div>

          {/* Platform filter */}
          {posts.length > 0 && (
            <div className="flex gap-1.5">
              {(["all", "instagram", "linkedin"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border",
                    filter === f
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground border-border/20 hover:border-border/40",
                  )}
                >
                  {f === "instagram" && <Instagram className="w-3 h-3" />}
                  {f === "linkedin"  && <Linkedin  className="w-3 h-3" />}
                  {f === "all" ? "All" : f === "instagram" ? `Instagram (${igPosts.length})` : `LinkedIn (${liPosts.length})`}
                </button>
              ))}
            </div>
          )}

          {/* Generating notice */}
          {generating && (
            <div className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-sm border",
              imageStatus?.error
                ? "bg-destructive/8 border-destructive/20 text-destructive"
                : "bg-primary/8 border-primary/20 text-primary",
            )}>
              <Sparkles className={cn("w-4 h-4 shrink-0", !imageStatus?.error && "animate-pulse")} />
              <div className="flex-1 min-w-0">
                {imageStatus?.error ? (
                  /* Error state — generation failed, stop retrying, let user decide */
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">Image generation failed — check your OpenAI API key is set correctly.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        hasAutoResumedRef.current = false
                        resumeImages.mutate()
                      }}
                      disabled={resumeImages.isPending}
                    >
                      {resumeImages.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Try Again"}
                    </Button>
                  </div>
                ) : imageStatus?.active && imageStatus?.currentImage && imageStatus?.totalImages ? (
                  /* Active — show per-image progress bar + stop button */
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <p className="font-medium truncate">
                        Generating image {imageStatus.currentImage} of {imageStatus.totalImages}
                        {imageStatus.currentTheme ? ` — ${imageStatus.currentTheme}` : ""}
                      </p>
                      <div className="h-1 rounded-full bg-primary/20 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60 transition-all duration-700"
                          style={{ width: `${(imageStatus.currentImage / imageStatus.totalImages) * 100}%` }}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => stopGeneration.mutate()}
                      disabled={stopGeneration.isPending}
                    >
                      {stopGeneration.isPending
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : "Stop"}
                    </Button>
                  </div>
                ) : resumeImages.isPending ? (
                  <p>Starting image generation…</p>
                ) : (
                  <p>Generating AI images in the background — they'll appear as they complete.</p>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && posts.length === 0 && !isGenerating && (
            <div className="text-center py-14 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-foreground font-semibold">No content scheduled yet</p>
                <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">
                  Click "Generate Schedule" — ChatGPT will read your website and create a full month of Instagram and LinkedIn posts with AI-generated visuals.
                </p>
              </div>
              <Button
                onClick={() => handleGenerate(`${month}-01`)}
                disabled={isGenerating}
              >
                <Sparkles className="w-4 h-4" />
                Generate {formatMonth(month)} Schedule
              </Button>
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          )}

          {/* Cards view */}
          {!isLoading && posts.length > 0 && viewMode === "cards" && (() => {
            // Group filtered posts by date
            const filtered = filter === "all" ? posts : posts.filter(p => p.platform === filter)
            const dateMap: Record<string, SocialPost[]> = {}
            for (const p of filtered) {
              if (!dateMap[p.scheduledDate]) dateMap[p.scheduledDate] = []
              dateMap[p.scheduledDate].push(p)
            }
            const dates = Object.keys(dateMap).sort()
            return (
              <div className="space-y-5">
                {dates.map(date => (
                  <div key={date}>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5 px-0.5">
                      {new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
                        weekday: "long", day: "numeric", month: "long",
                      })}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {dateMap[date].map(post => (
                        <PostCard
                          key={post.id}
                          post={post}
                          onClick={() => setSelectedPost(post)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Calendar grid */}
          {!isLoading && posts.length > 0 && viewMode === "calendar" && (
            <>
              <div className="grid grid-cols-7 gap-1">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <div key={d} className="text-center text-[10px] text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, i) => {
                  if (!cell.day || !cell.dateStr) return <div key={`e${i}`} className="h-20" />
                  const today    = new Date().toISOString().split("T")[0]
                  const isToday  = cell.dateStr === today
                  const dayPosts = byDate[cell.dateStr] || []
                  return (
                    <div
                      key={cell.dateStr}
                      className={cn(
                        "h-20 rounded-lg p-1.5 flex flex-col gap-0.5 border transition-colors",
                        dayPosts.length > 0 ? "bg-muted/30 border-border/20 hover:border-border/40" : "bg-transparent border-border/10",
                        isToday && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <span className={cn("text-[10px] font-medium mb-0.5", isToday ? "text-primary" : "text-muted-foreground")}>
                        {cell.day}
                      </span>
                      {dayPosts.slice(0, 2).map(p => <PlatformChip key={p.id} post={p} />)}
                      {dayPosts.length > 2 && (
                        <span className="text-[8px] text-muted-foreground pl-1">+{dayPosts.length - 2}</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-2 text-[10px]">
                {Object.entries(STATUS_LABELS).map(([s, l]) => (
                  <span key={s} className={cn("flex items-center gap-1 px-2 py-0.5 rounded border", STATUS_COLORS[s])}>
                    {l}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Post drawer */}
      {selectedPost && (
        <PostDrawer post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}

      {/* Style picker — opens before generation starts */}
      {pendingGenerate && !savedStyleLoading && (
        <StylePickerDialog
          productId={productId}
          month={pendingGenerate.startDate}
          onConfirm={handleStyleConfirm}
          onCancel={() => setPendingGenerate(null)}
          savedStyle={savedStyleData?.styleGuide}
          savedStylePreset={savedStyleData?.stylePreset}
          onClearSaved={isOwner ? handleClearSavedStyle : undefined}
          isOwner={isOwner}
        />
      )}
    </div>
  )
}
