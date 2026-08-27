import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { EmailSection } from "@/lib/email-sections";

type Props = {
  section: EmailSection;
  onChange: (patch: Partial<EmailSection>) => void;
  logoUrl?: string | null;
};

function patchContent(section: EmailSection, content: Record<string, unknown>, onChange: Props["onChange"]) {
  onChange({ content: { ...section.content, ...content } });
}

function patchStyle(section: EmailSection, style: Record<string, unknown>, onChange: Props["onChange"]) {
  onChange({ style: { ...section.style, ...style } });
}

export function SectionSettingsPanel({ section, onChange, logoUrl }: Props) {
  const { type, content, style } = section;

  const alignmentField = (
    <label className="space-y-1 text-xs text-muted-foreground">
      Alignment
      <select
        value={String(style.alignment ?? "left")}
        onChange={e => patchStyle(section, { alignment: e.target.value }, onChange)}
        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
      >
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    </label>
  );

  switch (type) {
    case "text":
      return (
        <div className="space-y-3">
          <RichTextEditor
            value={String(content.html ?? "")}
            onChange={html => patchContent(section, { html }, onChange)}
            minHeight={180}
            logoUrl={logoUrl}
          />
          {alignmentField}
        </div>
      );
    case "heading":
      return (
        <div className="space-y-3">
          <Input
            value={String(content.text ?? "")}
            onChange={e => patchContent(section, { text: e.target.value }, onChange)}
            placeholder="Heading text"
          />
          {alignmentField}
        </div>
      );
    case "image":
      return (
        <div className="space-y-3">
          <Input value={String(content.url ?? "")} onChange={e => patchContent(section, { url: e.target.value }, onChange)} placeholder="Image URL" />
          <Input value={String(content.alt ?? "")} onChange={e => patchContent(section, { alt: e.target.value }, onChange)} placeholder="Alt text" />
          <Input value={String(content.linkUrl ?? "")} onChange={e => patchContent(section, { linkUrl: e.target.value }, onChange)} placeholder="Link URL (optional)" />
          {alignmentField}
        </div>
      );
    case "button":
      return (
        <div className="space-y-3">
          <Input value={String(content.label ?? "")} onChange={e => patchContent(section, { label: e.target.value }, onChange)} placeholder="Button label" />
          <Input value={String(content.url ?? "")} onChange={e => patchContent(section, { url: e.target.value }, onChange)} placeholder="Button URL" />
          {alignmentField}
        </div>
      );
    case "divider":
      return (
        <div className="space-y-3">
          <Input value={String(style.color ?? "#e2e8f0")} onChange={e => patchStyle(section, { color: e.target.value }, onChange)} placeholder="Colour" />
        </div>
      );
    case "spacer":
      return (
        <label className="space-y-1 text-xs text-muted-foreground">
          Height (px)
          <Input type="number" min={8} max={120} value={Number(content.height ?? 24)} onChange={e => patchContent(section, { height: Number(e.target.value) || 24 }, onChange)} />
        </label>
      );
    case "header":
      return (
        <div className="space-y-3">
          <select
            value={String(content.variant ?? "branded")}
            onChange={e => patchContent(section, { variant: e.target.value }, onChange)}
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="minimal">Minimal (logo only)</option>
            <option value="branded">Branded</option>
            <option value="personal">Personal (no logo)</option>
          </select>
          <Input value={String(content.headline ?? "")} onChange={e => patchContent(section, { headline: e.target.value }, onChange)} placeholder="Headline (optional)" />
          <Input value={String(content.subtext ?? "")} onChange={e => patchContent(section, { subtext: e.target.value }, onChange)} placeholder="Subtext (optional)" />
          {alignmentField}
        </div>
      );
    case "footer":
      return (
        <div className="space-y-3">
          <Input value={String(content.companyName ?? "")} onChange={e => patchContent(section, { companyName: e.target.value }, onChange)} placeholder="Company name" />
          <Input value={String(content.address ?? "")} onChange={e => patchContent(section, { address: e.target.value }, onChange)} placeholder="Address" />
          <Input value={String(content.website ?? "")} onChange={e => patchContent(section, { website: e.target.value }, onChange)} placeholder="Website" />
          <Textarea value={String(content.disclaimer ?? "")} onChange={e => patchContent(section, { disclaimer: e.target.value }, onChange)} rows={3} placeholder="Disclaimer" />
          {alignmentField}
        </div>
      );
    case "imageText":
      return (
        <div className="space-y-3">
          <select
            value={String(content.layout ?? "imageLeft")}
            onChange={e => patchContent(section, { layout: e.target.value }, onChange)}
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="imageLeft">Image left</option>
            <option value="imageRight">Image right</option>
            <option value="imageTop">Image top</option>
          </select>
          <Input value={String(content.imageUrl ?? "")} onChange={e => patchContent(section, { imageUrl: e.target.value }, onChange)} placeholder="Image URL" />
          <RichTextEditor value={String(content.textHtml ?? "")} onChange={html => patchContent(section, { textHtml: html }, onChange)} minHeight={140} />
        </div>
      );
    case "html":
      return (
        <Textarea
          value={String(content.html ?? "")}
          onChange={e => patchContent(section, { html: e.target.value }, onChange)}
          rows={10}
          className="font-mono text-xs"
          placeholder="<p>Custom HTML</p>"
        />
      );
    default:
      return null;
  }
}
