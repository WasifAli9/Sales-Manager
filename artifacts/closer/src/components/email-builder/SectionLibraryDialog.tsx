import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { EmailSection, SectionType } from "@/lib/email-sections";
import { SECTION_CATALOG, STARTER_SECTIONS, createDefaultSection } from "./blocks/registry";

type SavedSection = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  sectionsJson: EmailSection[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedSections: SavedSection[];
  onAddType: (type: SectionType) => void;
  onInsertSaved: (sections: EmailSection[]) => void;
};

export function SectionLibraryDialog({ open, onOpenChange, savedSections, onAddType, onInsertSaved }: Props) {
  const [tab, setTab] = useState<"basic" | "saved" | "starters">("basic");
  const groups = [...new Set(SECTION_CATALOG.map(c => c.group))];

  const copySections = (raw: EmailSection[]) =>
    raw.map(s => ({ ...s, id: crypto.randomUUID(), savedSectionId: null }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add section</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {(["basic", "saved", "starters"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {t === "basic" ? "Blocks" : t}
            </button>
          ))}
        </div>

        {tab === "basic" && (
          <div className="space-y-4">
            {groups.map(group => (
              <div key={group}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                <div className="grid grid-cols-2 gap-2">
                  {SECTION_CATALOG.filter(c => c.group === group).map(item => (
                    <Button
                      key={item.type}
                      type="button"
                      variant="outline"
                      className="h-auto justify-start px-3 py-2 text-xs"
                      onClick={() => { onAddType(item.type); onOpenChange(false); }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "saved" && (
          <div className="space-y-2">
            {savedSections.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved sections yet. Build one and use Save as reusable.</p>
            ) : savedSections.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onInsertSaved(copySections(item.sectionsJson)); onOpenChange(false); }}
                className="w-full rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/40"
              >
                <p className="text-sm font-medium">{item.name}</p>
                {item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
              </button>
            ))}
          </div>
        )}

        {tab === "starters" && (
          <div className="space-y-2">
            {STARTER_SECTIONS.map((starter, index) => (
              <button
                key={index}
                type="button"
                onClick={() => { onInsertSaved(copySections(starter.sections)); onOpenChange(false); }}
                className="w-full rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/40"
              >
                <p className="text-sm font-medium">{starter.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{starter.description}</p>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { createDefaultSection };
