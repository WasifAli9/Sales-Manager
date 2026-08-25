import { Document, HeadingLevel, Packer, Paragraph, TextRun, BorderStyle } from "docx";
import PDFDocument from "pdfkit";

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "li"; text: string; level: number }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "table"; rows: string[][] };

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

function parseInlineRuns(text: string, opts?: { bold?: boolean; size?: number; color?: string }): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    const value = bold ? part.slice(2, -2) : part;
    return new TextRun({
      text: value,
      bold: bold || opts?.bold,
      size: opts?.size ?? 22,
      color: opts?.color,
      font: "Calibri",
    });
  });
}

/** Parse a constrained markdown dialect produced by buildStrategyDocument. */
export function parseStrategyMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed === "---") {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", text: stripMd(trimmed.slice(2)) });
      i += 1;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", text: stripMd(trimmed.slice(3)) });
      i += 1;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", text: stripMd(trimmed.slice(4)) });
      i += 1;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines = [stripMd(trimmed.replace(/^>\s?/, ""))];
      i += 1;
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        quoteLines.push(stripMd((lines[i] ?? "").trim().replace(/^>\s?/, "")));
        i += 1;
      }
      blocks.push({ type: "quote", text: quoteLines.join(" ") });
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        const rowLine = (lines[i] ?? "").trim();
        if (!/^\|\s*-+/.test(rowLine)) {
          rows.push(
            rowLine
              .slice(1, -1)
              .split("|")
              .map((cell) => stripMd(cell.trim())),
          );
        }
        i += 1;
      }
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }

    const bullet = trimmed.match(/^(-|\*)\s+(.*)$/);
    if (bullet) {
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      blocks.push({ type: "li", text: bullet[2] ?? "", level: Math.floor(indent / 2) });
      i += 1;
      continue;
    }

    blocks.push({ type: "p", text: trimmed });
    i += 1;
  }

  return blocks;
}

export async function strategyMarkdownToDocx(markdown: string, title: string): Promise<Buffer> {
  const blocks = parseStrategyMarkdown(markdown);
  const children: Paragraph[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "h1":
        children.push(
          new Paragraph({
            heading: HeadingLevel.TITLE,
            spacing: { after: 200 },
            children: [new TextRun({ text: block.text, bold: true, size: 36, font: "Calibri", color: "0B1220" })],
          }),
        );
        break;
      case "h2":
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 320, after: 160 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "4DD4C1", space: 8 },
            },
            children: [new TextRun({ text: block.text, bold: true, size: 28, font: "Calibri", color: "0F766E" })],
          }),
        );
        break;
      case "h3":
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 80 },
            children: [new TextRun({ text: block.text, bold: true, size: 24, font: "Calibri", color: "334155" })],
          }),
        );
        break;
      case "p":
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: parseInlineRuns(block.text),
          }),
        );
        break;
      case "li":
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: 360 + block.level * 240 },
            children: [
              new TextRun({ text: "• ", size: 22, font: "Calibri", color: "0F766E" }),
              ...parseInlineRuns(block.text),
            ],
          }),
        );
        break;
      case "quote":
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 120 },
            indent: { left: 240 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 18, color: "F59E0B", space: 10 },
            },
            children: parseInlineRuns(block.text, { size: 20, color: "92400E" }),
          }),
        );
        break;
      case "hr":
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 160 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 1 },
            },
            children: [],
          }),
        );
        break;
      case "table":
        for (const [rowIndex, row] of block.rows.entries()) {
          children.push(
            new Paragraph({
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: row.join("  ·  "),
                  bold: rowIndex === 0,
                  size: 20,
                  font: "Calibri",
                  color: rowIndex === 0 ? "0F766E" : "334155",
                }),
              ],
            }),
          );
        }
        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
        break;
    }
  }

  if (!children.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: title, bold: true })] }));
  }

  const doc = new Document({
    creator: "Sales Manager",
    title,
    description: "Strategist sales strategy document",
    sections: [{ properties: {}, children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function strategyMarkdownToPdf(markdown: string, title: string): Promise<Buffer> {
  const blocks = parseStrategyMarkdown(markdown);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 56,
      size: "A4",
      info: { Title: title, Author: "Sales Manager", Creator: "Sales Manager" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    for (const block of blocks) {
      switch (block.type) {
        case "h1":
          doc.moveDown(0.2);
          doc.fillColor("#0B1220").font("Helvetica-Bold").fontSize(22).text(block.text, { width: pageWidth });
          doc.moveDown(0.4);
          break;
        case "h2":
          doc.moveDown(0.6);
          doc.fillColor("#0F766E").font("Helvetica-Bold").fontSize(14).text(block.text, { width: pageWidth });
          doc
            .moveTo(doc.page.margins.left, doc.y + 2)
            .lineTo(doc.page.margins.left + pageWidth, doc.y + 2)
            .strokeColor("#4DD4C1")
            .lineWidth(1)
            .stroke();
          doc.moveDown(0.6);
          break;
        case "h3":
          doc.moveDown(0.35);
          doc.fillColor("#334155").font("Helvetica-Bold").fontSize(12).text(block.text, { width: pageWidth });
          doc.moveDown(0.2);
          break;
        case "p":
          doc.fillColor("#1E293B").font("Helvetica").fontSize(10.5).text(stripMd(block.text), {
            width: pageWidth,
            lineGap: 2,
          });
          doc.moveDown(0.35);
          break;
        case "li":
          doc
            .fillColor("#0F766E")
            .font("Helvetica")
            .fontSize(10.5)
            .text("•", { continued: true, indent: block.level * 14 });
          doc.fillColor("#1E293B").text(` ${stripMd(block.text)}`, {
            width: pageWidth - block.level * 14,
            lineGap: 1.5,
          });
          break;
        case "quote":
          doc.moveDown(0.2);
          const quoteX = doc.page.margins.left;
          const quoteY = doc.y;
          doc.rect(quoteX, quoteY, 3, 28).fill("#F59E0B");
          doc
            .fillColor("#92400E")
            .font("Helvetica-Oblique")
            .fontSize(9.5)
            .text(stripMd(block.text), quoteX + 12, quoteY, { width: pageWidth - 12, lineGap: 2 });
          doc.moveDown(0.5);
          break;
        case "hr":
          doc.moveDown(0.4);
          doc
            .moveTo(doc.page.margins.left, doc.y)
            .lineTo(doc.page.margins.left + pageWidth, doc.y)
            .strokeColor("#CBD5E1")
            .lineWidth(0.8)
            .stroke();
          doc.moveDown(0.6);
          break;
        case "table":
          for (const [rowIndex, row] of block.rows.entries()) {
            doc
              .fillColor(rowIndex === 0 ? "#0F766E" : "#334155")
              .font(rowIndex === 0 ? "Helvetica-Bold" : "Helvetica")
              .fontSize(9.5)
              .text(row.join("  ·  "), { width: pageWidth });
          }
          doc.moveDown(0.4);
          break;
      }
    }

    doc.end();
  });
}

export function strategyExportFilename(productName: string, format: "pdf" | "docx"): string {
  const safe = productName.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "strategy";
  return `${safe}_Sales_Strategy.${format}`;
}
