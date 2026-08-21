/**
 * RichTextEditor — Tiptap v3-based rich text editor for email compose + templates.
 * Supports: bold, italic, underline, font sizes, bullet/numbered lists,
 *           links, image insertion (URL or file upload), text colour.
 */
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Underline } from "@tiptap/extension-underline"
import { Link } from "@tiptap/extension-link"
import { Image } from "@tiptap/extension-image"
import { FontSize, Color } from "@tiptap/extension-text-style"
import { Placeholder } from "@tiptap/extension-placeholder"
import { useEffect, useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import {
  Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon,
  List, ListOrdered, Image as ImageIcon, Type, X, Upload,
} from "lucide-react"

// ── Helpers ────────────────────────────────────────────────────────────────
const FONT_SIZES = [
  { label: "Small", value: "12px" },
  { label: "Normal", value: "14px" },
  { label: "Large", value: "18px" },
  { label: "Heading", value: "24px" },
]

const COLORS = [
  "#ffffff", "#a0a0a0", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899",
]

// ── Toolbar button ─────────────────────────────────────────────────────────
function ToolBtn({
  onClick, active, title, children, disabled,
}: {
  onClick: () => void; active?: boolean; title?: string; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      disabled={disabled}
      className={cn(
        "p-1.5 rounded text-xs transition-colors",
        active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  )
}

// ── Link dialog ────────────────────────────────────────────────────────────
function LinkDialog({ onSet, onClose }: { onSet: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState("https://")
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-popover border border-border/30 shadow-xl">
      <input
        autoFocus
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onSet(url) } if (e.key === "Escape") onClose() }}
        placeholder="https://…"
        className="bg-transparent text-xs text-foreground outline-none w-52 placeholder:text-muted-foreground/50"
      />
      <button
        type="button"
        onMouseDown={e => { e.preventDefault(); onSet(url) }}
        className="text-xs text-primary hover:text-primary/80 font-medium"
      >
        Set
      </button>
      <button type="button" onMouseDown={e => { e.preventDefault(); onClose() }} className="text-muted-foreground hover:text-foreground">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Image dialog ───────────────────────────────────────────────────────────
function ImageDialog({ onInsert, onClose }: { onInsert: (src: string, alt?: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState("")
  const [alt, setAlt] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      // Try presigned object storage upload
      const reqRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      })
      if (reqRes.ok) {
        const { uploadURL, objectPath } = await reqRes.json()
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
        onInsert(`${BASE}/api/storage/objects/${objectPath}`, alt || file.name)
        return
      }
    } catch { /* fall through */ }
    // Fallback: base64 data URL
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") onInsert(reader.result, alt || file.name)
    }
    reader.readAsDataURL(file)
    setUploading(false)
  }

  return (
    <div className="relative p-3 rounded-xl bg-popover border border-border/30 shadow-xl w-72 space-y-2">
      <p className="text-xs font-medium text-foreground">Insert image</p>
      <input
        autoFocus
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && url) { e.preventDefault(); onInsert(url, alt) } if (e.key === "Escape") onClose() }}
        placeholder="Paste image URL…"
        className="w-full bg-muted/40 border border-border/30 rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <input
        value={alt}
        onChange={e => setAlt(e.target.value)}
        placeholder="Alt text (optional)"
        className="w-full bg-muted/40 border border-border/30 rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); if (url) onInsert(url, alt) }}
          disabled={!url}
          className="flex-1 bg-primary/10 text-primary text-xs py-1.5 rounded-lg hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          Insert URL
        </button>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); fileRef.current?.click() }}
          disabled={uploading}
          className="flex-1 bg-muted/40 text-foreground text-xs py-1.5 rounded-lg hover:bg-muted/60 flex items-center justify-center gap-1.5"
        >
          <Upload className="w-3 h-3" />
          {uploading ? "Uploading…" : "Upload file"}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button type="button" onMouseDown={e => { e.preventDefault(); onClose() }} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  /** Variable chips to insert (e.g. "{{firstName}}") */
  variables?: string[]
  className?: string
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your message…",
  minHeight = 180,
  variables,
  className,
}: RichTextEditorProps) {
  const [showLink, setShowLink] = useState(false)
  const [showImage, setShowImage] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [showFontSize, setShowFontSize] = useState(false)
  const isInternalChange = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline" } }),
      Image.configure({ inline: false, allowBase64: true }),
      FontSize,
      Color,
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      isInternalChange.current = true
      const html = editor.getHTML()
      onChange(html === "<p></p>" ? "" : html)
    },
    editorProps: {
      attributes: {
        class: "outline-none prose prose-invert prose-sm max-w-none px-3 py-2.5 text-sm text-foreground leading-relaxed",
      },
    },
  })

  // Sync external value changes (e.g. template applied)
  useEffect(() => {
    if (!editor) return
    if (isInternalChange.current) {
      isInternalChange.current = false
      return
    }
    const normalised = value || ""
    if (editor.getHTML() !== normalised) {
      editor.commands.setContent(normalised)
    }
  }, [value, editor])

  const insertVariable = useCallback((v: string) => {
    editor?.chain().focus().insertContent(v).run()
  }, [editor])

  const closeAll = () => { setShowLink(false); setShowImage(false); setShowColors(false); setShowFontSize(false) }

  if (!editor) return null

  // Current color from marks
  const currentColor = editor.getAttributes("textStyle")?.color as string | undefined

  return (
    <div className={cn("rounded-xl border border-border/30 bg-muted/40 overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/20 flex-wrap">
        {/* Text style */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolBtn>

        <div className="w-px h-4 bg-border/30 mx-1" />

        {/* Font size dropdown */}
        <div className="relative">
          <ToolBtn
            onClick={() => { setShowFontSize(v => !v); setShowColors(false); setShowLink(false); setShowImage(false) }}
            title="Font size"
          >
            <span className="flex items-center gap-1">
              <Type className="w-3.5 h-3.5" />
              <span className="text-[10px] leading-none">Aa</span>
            </span>
          </ToolBtn>
          {showFontSize && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border/30 rounded-lg shadow-xl py-1 min-w-[110px]">
              {FONT_SIZES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault()
                    ;(editor.chain().focus() as any).setFontSize(s.value).run()
                    setShowFontSize(false)
                  }}
                  className="w-full text-left px-3 py-1.5 text-foreground hover:bg-muted/50 transition-colors"
                  style={{ fontSize: s.value }}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  ;(editor.chain().focus() as any).unsetFontSize().run()
                  setShowFontSize(false)
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors border-t border-border/20 mt-1"
              >
                Reset
              </button>
            </div>
          )}
        </div>

        {/* Color picker */}
        <div className="relative">
          <ToolBtn
            onClick={() => { setShowColors(v => !v); setShowFontSize(false); setShowLink(false); setShowImage(false) }}
            title="Text colour"
          >
            <span className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-bold leading-none">A</span>
              <span
                className="w-3 h-0.5 rounded-full"
                style={{ backgroundColor: currentColor || "#ffffff" }}
              />
            </span>
          </ToolBtn>
          {showColors && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border/30 rounded-lg shadow-xl p-2">
              <div className="grid grid-cols-3 gap-1.5">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault()
                      ;(editor.chain().focus() as any).setColor(c).run()
                      setShowColors(false)
                    }}
                    className="w-6 h-6 rounded-full border border-white/10 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  ;(editor.chain().focus() as any).unsetColor().run()
                  setShowColors(false)
                }}
                className="w-full mt-2 text-[10px] text-muted-foreground hover:text-foreground text-center border-t border-border/20 pt-1.5"
              >
                Reset colour
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-border/30 mx-1" />

        {/* Lists */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
          <List className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolBtn>

        <div className="w-px h-4 bg-border/30 mx-1" />

        {/* Link */}
        <div className="relative">
          <ToolBtn
            onClick={() => {
              if (editor.isActive("link")) {
                editor.chain().focus().unsetLink().run()
              } else {
                setShowLink(v => !v); setShowColors(false); setShowFontSize(false); setShowImage(false)
              }
            }}
            active={editor.isActive("link")}
            title="Link"
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </ToolBtn>
          {showLink && (
            <div className="absolute top-full left-0 mt-1 z-50">
              <LinkDialog
                onSet={url => {
                  editor.chain().focus().setLink({ href: url, target: "_blank" }).run()
                  setShowLink(false)
                }}
                onClose={() => setShowLink(false)}
              />
            </div>
          )}
        </div>

        {/* Image */}
        <div className="relative">
          <ToolBtn
            onClick={() => { setShowImage(v => !v); setShowColors(false); setShowFontSize(false); setShowLink(false) }}
            title="Insert image"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </ToolBtn>
          {showImage && (
            <div className="absolute top-full left-0 mt-1 z-50">
              <ImageDialog
                onInsert={(src, alt) => {
                  editor.chain().focus().setImage({ src, alt }).run()
                  setShowImage(false)
                }}
                onClose={() => setShowImage(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div
        style={{ minHeight: `${minHeight}px` }}
        onClick={() => editor.chain().focus().run()}
        className="cursor-text"
      >
        <EditorContent editor={editor} />
      </div>

      {/* Variable chips */}
      {variables && variables.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-t border-border/20">
          {variables.map(v => (
            <button
              key={v}
              type="button"
              onMouseDown={e => { e.preventDefault(); insertVariable(v) }}
              className="text-[10px] text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded hover:bg-primary/20 transition-colors font-mono"
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
