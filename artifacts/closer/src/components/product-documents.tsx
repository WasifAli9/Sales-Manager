import { useState, useRef, useEffect } from "react"
import { useProductDocuments, useProductDocumentMutations } from "@/hooks/use-product-documents"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  FileText, Upload, Trash2, Plus, File, Loader2, AlignLeft, ExternalLink, Download, FileType2
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import { downloadDocumentExport } from "@/lib/download-document-export"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DocIcon({ mimeType }: { mimeType?: string | null }) {
  const t = mimeType ?? ""
  if (t.includes("pdf")) return <FileText className="w-4 h-4 text-red-400 shrink-0" />
  if (t.includes("word") || t.includes("document") || t.includes("markdown")) return <FileText className="w-4 h-4 text-blue-400 shrink-0" />
  if (t.startsWith("text/")) return <AlignLeft className="w-4 h-4 text-muted-foreground shrink-0" />
  return <File className="w-4 h-4 text-muted-foreground shrink-0" />
}

function isMarkdownDoc(doc: { mimeType?: string | null; name?: string; textContent?: string | null }) {
  const mime = doc.mimeType ?? ""
  if (mime.includes("markdown")) return true
  if (doc.name?.toLowerCase().includes("sales strategy")) return true
  const text = doc.textContent ?? ""
  return text.includes("# Sales Strategy Document") || /^#\s/m.test(text)
}

interface Props {
  productId: number
  initialOpenDocumentId?: number
}

export function ProductDocuments({ productId, initialOpenDocumentId }: Props) {
  const docs = useProductDocuments(productId)
  const { create, remove, uploadFile } = useProductDocumentMutations(productId)
  const [addOpen, setAddOpen] = useState(false)
  const [mode, setMode] = useState<"text" | "file">("text")
  const [name, setName] = useState("")
  const [content, setContent] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const docList = docs.data ?? []

  const resetForm = () => {
    setName("")
    setContent("")
    setSelectedFile(null)
    setUploadError(null)
    setMode("text")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleTextSave = () => {
    if (!name.trim()) return
    create.mutate(
      { id: productId, data: { name: name.trim(), textContent: content } },
      { onSuccess: () => { setAddOpen(false); resetForm() } },
    )
  }

  const handleFileUpload = async () => {
    if (!selectedFile) return
    const docName = name.trim() || selectedFile.name
    setUploading(true)
    setUploadError(null)
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedFile.name,
          size: selectedFile.size,
          contentType: selectedFile.type || "application/octet-stream",
        }),
      })
      if (!urlRes.ok) throw new Error("Failed to get upload URL")
      const { uploadURL, objectPath } = (await urlRes.json()) as { uploadURL: string; objectPath: string }

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: selectedFile,
        headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
      })
      if (!putRes.ok) throw new Error("Upload failed")

      create.mutate(
        {
          id: productId,
          data: {
            name: docName,
            storageKey: objectPath,
            mimeType: selectedFile.type || "application/octet-stream",
            fileSizeBytes: selectedFile.size,
          },
        },
        { onSuccess: () => { setAddOpen(false); resetForm() } },
      )
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = (docId: number) => {
    remove.mutate({ productId, docId })
  }

  const isSubmitting = create.isPending || uploading

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Documents
          {docList.length > 0 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground/60 normal-case">
              {docList.length}
            </span>
          )}
        </h2>
        <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) resetForm() }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-primary gap-1">
              <Plus className="w-3 h-3" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>Add Document</DialogTitle>
            </DialogHeader>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setMode("text")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors
                  ${mode === "text" ? "bg-primary/10 border-primary/30 text-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
              >
                <AlignLeft className="w-4 h-4" />
                Paste text
              </button>
              <button
                onClick={() => setMode("file")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors
                  ${mode === "file" ? "bg-primary/10 border-primary/30 text-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
              >
                <Upload className="w-4 h-4" />
                Upload file
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Document name</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={mode === "file" ? "Optional — defaults to filename" : "e.g. Customer call notes, Product brief…"}
                  autoFocus
                />
              </div>

              {mode === "text" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Content</label>
                  <Textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Paste notes, research, transcripts, briefs, or any text that gives context to this product…"
                    className="min-h-[180px] text-sm leading-relaxed"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">File</label>
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <DocIcon mimeType={selectedFile.type} />
                        <div className="text-left">
                          <p className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Click to choose a file</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">PDF, Word, text, or any file type</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) setSelectedFile(f)
                    }}
                  />
                </div>
              )}

              {uploadError && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2">{uploadError}</p>
              )}
            </div>

            <div className="pt-4 border-t border-border shrink-0">
              <Button
                className="w-full min-h-[44px] gap-2"
                onClick={mode === "text" ? handleTextSave : handleFileUpload}
                disabled={
                  isSubmitting ||
                  !name.trim() && mode === "text" ||
                  mode === "file" && !selectedFile
                }
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                ) : (
                  <>{mode === "text" ? <AlignLeft className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  Save Document</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {docs.isLoading ? (
        <div className="h-20 bg-muted animate-pulse rounded-2xl" />
      ) : docList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center space-y-3">
          <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No documents yet.</p>
          <p className="text-xs text-muted-foreground/60">Add call notes, product briefs, research, or any files that give context to this product.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docList.map(doc => (
            <Card key={doc.id} className="border-border group">
              <CardContent className="p-3 flex items-center gap-3">
                <DocIcon mimeType={doc.mimeType} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground/60">
                    {doc.storageKey
                      ? doc.fileSizeBytes != null ? formatBytes(doc.fileSizeBytes) : "File"
                      : doc.textContent
                        ? `${doc.textContent.length.toLocaleString()} chars`
                        : "Empty"}
                    {" · "}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.storageKey && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-muted-foreground hover:text-primary"
                      asChild
                    >
                      <a
                        href={`${BASE}/api${doc.storageKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open file"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  )}
                  {doc.textContent && (
                    <ViewTextDocButton
                      productId={productId}
                      doc={doc}
                      openOnMount={doc.id === initialOpenDocumentId}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(doc.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ViewTextDocButton({
  productId,
  doc,
  openOnMount = false,
}: {
  productId: number
  doc: { id: number; name: string; textContent?: string | null; mimeType?: string | null }
  openOnMount?: boolean
}) {
  const [open, setOpen] = useState(openOnMount)
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const markdown = isMarkdownDoc(doc)

  useEffect(() => {
    if (openOnMount) setOpen(true)
  }, [openOnMount])

  const handleExport = async (format: "pdf" | "docx") => {
    setExportError(null)
    setExporting(format)
    try {
      await downloadDocumentExport(productId, doc.id, format)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Download failed")
    } finally {
      setExporting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-primary" title="View content">
          <AlignLeft className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-2xl flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 space-y-3">
          <DialogTitle className="truncate pr-6">{doc.name}</DialogTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!!exporting}
              onClick={() => void handleExport("pdf")}
            >
              {exporting === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!!exporting}
              onClick={() => void handleExport("docx")}
            >
              {exporting === "docx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileType2 className="w-3.5 h-3.5" />}
              DOCX
            </Button>
          </div>
          {exportError && <p className="text-xs text-destructive">{exportError}</p>}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {markdown ? (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/85 prose-strong:text-foreground prose-li:text-foreground/85 prose-hr:border-border">
              <ReactMarkdown>{doc.textContent ?? ""}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {doc.textContent}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

