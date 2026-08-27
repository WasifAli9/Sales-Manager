import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Save, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmailSection, SectionType } from "@/lib/email-sections";
import { SortableSectionList } from "./SortableSectionList";
import { SectionSettingsPanel } from "./SectionSettingsPanel";
import { SectionLibraryDialog, createDefaultSection } from "./SectionLibraryDialog";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type Props = {
  productId: number;
  sections: EmailSection[];
  onChange: (sections: EmailSection[]) => void;
  logoUrl?: string | null;
  designTemplateId?: number | null;
};

export function EmailSectionBuilder({ productId, sections, onChange, logoUrl, designTemplateId }: Props) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.id ?? null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const savedQuery = useQuery({
    queryKey: ["email-saved-sections", productId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/products/${productId}/email-sections`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load saved sections");
      const data = await res.json();
      return (data.sections ?? []) as Array<{ id: number; name: string; description: string | null; category: string | null; sectionsJson: EmailSection[] }>;
    },
    enabled: productId > 0,
  });

  useEffect(() => {
    if (selectedId && !sections.some(s => s.id === selectedId)) {
      setSelectedId(sections[0]?.id ?? null);
    }
  }, [sections, selectedId]);

  const selected = sections.find(s => s.id === selectedId) ?? null;

  const updateSelected = (patch: Partial<EmailSection>) => {
    if (!selected) return;
    onChange(sections.map(s => s.id === selected.id ? { ...s, ...patch } : s));
  };

  const addType = (type: SectionType) => {
    const section = createDefaultSection(type);
    onChange([...sections, section]);
    setSelectedId(section.id);
  };

  const insertSaved = (batch: EmailSection[]) => {
    onChange([...sections, ...batch]);
    if (batch[0]) setSelectedId(batch[0].id);
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`${BASE}/api/email-sections/render-preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, sections, templateId: designTemplateId ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreviewHtml(data.html);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Preview failed", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const saveReusable = async () => {
    if (!saveName.trim() || !sections.length) return;
    try {
      const res = await fetch(`${BASE}/api/products/${productId}/email-sections`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), sections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSaveName("");
      await savedQuery.refetch();
      toast({ title: "Section saved to library" });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Save failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setLibraryOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add section
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={runPreview} disabled={previewLoading || !sections.length}>
          {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Preview
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-2 min-h-[200px]">
          {sections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
              Add your first section to build this email visually.
            </div>
          ) : (
            <SortableSectionList
              sections={sections}
              selectedId={selectedId}
              onSectionsChange={onChange}
              onSelect={setSelectedId}
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3 lg:sticky lg:top-4 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Section settings</p>
          {selected ? (
            <SectionSettingsPanel section={selected} onChange={updateSelected} logoUrl={logoUrl} />
          ) : (
            <p className="text-xs text-muted-foreground">Select a section to edit its content and layout.</p>
          )}
        </div>
      </div>

      {sections.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/60 bg-muted/15 p-3">
          <div className="min-w-[200px] flex-1 space-y-1">
            <label className="text-[11px] text-muted-foreground">Save all sections as reusable</label>
            <Input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Section name" className="h-8 text-xs" />
          </div>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!saveName.trim()} onClick={saveReusable}>
            <Save className="h-3.5 w-3.5" /> Save as reusable
          </Button>
        </div>
      )}

      {previewHtml && (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <iframe title="Email preview" srcDoc={previewHtml} className="h-[420px] w-full border-0" />
        </div>
      )}

      <SectionLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        savedSections={savedQuery.data ?? []}
        onAddType={addType}
        onInsertSaved={insertSaved}
      />
    </div>
  );
}
