import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Copy, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EmailSection } from "@/lib/email-sections";
import { SECTION_CATALOG } from "./blocks/registry";

function labelForType(type: EmailSection["type"]) {
  return SECTION_CATALOG.find(c => c.type === type)?.label ?? type;
}

function SortableRow({
  section,
  selected,
  onSelect,
  onDuplicate,
  onHide,
  onDelete,
  onMove,
}: {
  section: EmailSection;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onHide: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-xl border bg-card p-3",
        selected ? "border-violet-500/50 ring-1 ring-violet-500/30" : "border-border/60",
        isDragging && "opacity-70",
        !section.visible && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <button type="button" className="mt-1 cursor-grab text-muted-foreground" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <p className="text-xs font-semibold">{labelForType(section.type)}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {section.type === "text" ? String(section.content.html ?? "").replace(/<[^>]+>/g, "").slice(0, 60) : String(section.content.text ?? section.content.label ?? "")}
          </p>
        </button>
        <div className="flex shrink-0 gap-0.5">
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onHide}><EyeOff className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

type Props = {
  sections: EmailSection[];
  selectedId: string | null;
  onSectionsChange: (sections: EmailSection[]) => void;
  onSelect: (id: string | null) => void;
};

export function SortableSectionList({ sections, selectedId, onSectionsChange, onSelect }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onSectionsChange(arrayMove(sections, oldIndex, newIndex));
  };

  const updateAt = (index: number, patch: Partial<EmailSection>) => {
    onSectionsChange(sections.map((s, i) => i === index ? { ...s, ...patch } : s));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {sections.map((section, index) => (
            <SortableRow
              key={section.id}
              section={section}
              selected={selectedId === section.id}
              onSelect={() => onSelect(section.id)}
              onDuplicate={() => {
                const copy = { ...section, id: crypto.randomUUID() };
                const next = [...sections];
                next.splice(index + 1, 0, copy);
                onSectionsChange(next);
              }}
              onHide={() => updateAt(index, { visible: !section.visible })}
              onDelete={() => {
                onSectionsChange(sections.filter((_, i) => i !== index));
                if (selectedId === section.id) onSelect(null);
              }}
              onMove={dir => {
                const target = index + dir;
                if (target < 0 || target >= sections.length) return;
                onSectionsChange(arrayMove(sections, index, target));
              }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
