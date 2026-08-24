/**
 * Excel generation for sales targets using ExcelJS.
 */
import ExcelJS from "exceljs";

export interface TargetRow {
  revenueLine: string;
  months: (number | null)[]; // [jan, feb, ..., dec]  — target amounts
  actuals: (number | null)[]; // [jan, feb, ..., dec]  — actual amounts
}

export interface ExcelBuildOptions {
  productName: string;
  year: number;
  rows: TargetRow[];
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const BRAND = "1E3A5F";   // dark navy header
const ACCENT = "22D3EE";  // teal accent
const ACTUAL_BG = "0F2A1A"; // dark green tint for actuals
const TOTAL_BG = "1A2744";  // slightly lighter navy for totals

function money(n: number | null): number {
  return n ?? 0;
}

export async function buildTargetWorkbook(opts: ExcelBuildOptions): Promise<Buffer> {
  const { productName, year, rows } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sales Manager";
  wb.created = new Date();

  const ws = wb.addWorksheet(`${productName} ${year}`, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  // ── Column widths ────────────────────────────────────────────────────────
  ws.getColumn(1).width = 28; // Revenue line
  for (let i = 2; i <= 14; i++) ws.getColumn(i).width = 11; // 12 months + total
  ws.getColumn(15).width = 12; // Actual total

  // ── Title row ────────────────────────────────────────────────────────────
  ws.mergeCells("A1:O1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${productName} — Sales Targets ${year}`;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF" + ACCENT } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(1).height = 32;

  // ── Sub-header (Target / Actual labels) ─────────────────────────────────
  ws.mergeCells("A2:A3");
  const revHeader = ws.getCell("A2");
  revHeader.value = "Revenue Line";
  styleHeader(revHeader);

  // Months span two rows each: top = "Month name", bottom = "Target | Actual"
  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    const cellAddr = ws.getCell(2, col);
    cellAddr.value = MONTH_NAMES[m];
    styleHeader(cellAddr);
    ws.mergeCells(2, col, 2, col);

    const tCell = ws.getCell(3, col);
    tCell.value = "Target";
    styleSubHeader(tCell, false);
  }

  // Annual total header
  ws.mergeCells("N2:N2");
  const totHeader = ws.getCell("N2");
  totHeader.value = "Annual Total";
  styleHeader(totHeader);
  const totSub = ws.getCell("N3");
  totSub.value = "Target";
  styleSubHeader(totSub, false);

  // Actual total header
  ws.mergeCells("O2:O2");
  const actTotHeader = ws.getCell("O2");
  actTotHeader.value = "Actual YTD";
  styleHeader(actTotHeader, true);
  const actTotSub = ws.getCell("O3");
  actTotSub.value = "Actual";
  styleSubHeader(actTotSub, true);

  ws.getRow(2).height = 22;
  ws.getRow(3).height = 18;

  // ── Data rows ────────────────────────────────────────────────────────────
  const dataStartRow = 4;

  rows.forEach((row, ri) => {
    const wsRow = ws.getRow(dataStartRow + ri);
    wsRow.height = 20;

    // Revenue line name
    const lineCell = wsRow.getCell(1);
    lineCell.value = row.revenueLine;
    lineCell.font = { bold: true, size: 10 };
    lineCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ri % 2 === 0 ? "FF0D1B2E" : "FF0B1628" } };
    lineCell.border = cellBorder();
    lineCell.alignment = { vertical: "middle", horizontal: "left" };

    let rowTarget = 0;
    let rowActual = 0;

    for (let m = 0; m < 12; m++) {
      const col = m + 2;
      const tAmt = money(row.months[m]);
      const aAmt = money(row.actuals[m]);
      rowTarget += tAmt;
      rowActual += aAmt;

      // Target cell
      const tCell = wsRow.getCell(col);
      tCell.value = tAmt;
      tCell.numFmt = '"$"#,##0.00';
      tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ri % 2 === 0 ? "FF0D1B2E" : "FF0B1628" } };
      tCell.border = cellBorder();
      tCell.alignment = { horizontal: "right", vertical: "middle" };
      tCell.font = { size: 10, color: { argb: tAmt > 0 ? "FFD1FAE5" : "FF4B5563" } };
    }

    // Annual target total
    const totCell = wsRow.getCell(14);
    totCell.value = rowTarget;
    totCell.numFmt = '"$"#,##0.00';
    totCell.font = { bold: true, size: 10, color: { argb: "FF" + ACCENT } };
    totCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + TOTAL_BG } };
    totCell.border = cellBorder();
    totCell.alignment = { horizontal: "right", vertical: "middle" };

    // Actual YTD total
    const actTotCell = wsRow.getCell(15);
    actTotCell.value = rowActual;
    actTotCell.numFmt = '"$"#,##0.00';
    actTotCell.font = { bold: true, size: 10, color: { argb: "FF86EFAC" } };
    actTotCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + ACTUAL_BG } };
    actTotCell.border = cellBorder();
    actTotCell.alignment = { horizontal: "right", vertical: "middle" };
  });

  // ── Totals row ───────────────────────────────────────────────────────────
  const totalRow = ws.getRow(dataStartRow + rows.length);
  totalRow.height = 24;

  const totLabelCell = totalRow.getCell(1);
  totLabelCell.value = "TOTAL";
  totLabelCell.font = { bold: true, size: 11, color: { argb: "FF" + ACCENT } };
  totLabelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND } };
  totLabelCell.border = cellBorder();
  totLabelCell.alignment = { horizontal: "left", vertical: "middle" };

  let grandTarget = 0;
  let grandActual = 0;

  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    const colTarget = rows.reduce((s, r) => s + money(r.months[m]), 0);
    const colActual = rows.reduce((s, r) => s + money(r.actuals[m]), 0);
    grandTarget += colTarget;
    grandActual += colActual;

    const tCell = totalRow.getCell(col);
    tCell.value = colTarget;
    tCell.numFmt = '"$"#,##0.00';
    tCell.font = { bold: true, size: 10, color: { argb: "FF" + ACCENT } };
    tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND } };
    tCell.border = cellBorder();
    tCell.alignment = { horizontal: "right", vertical: "middle" };
  }

  // Grand target total
  const gTotCell = totalRow.getCell(14);
  gTotCell.value = grandTarget;
  gTotCell.numFmt = '"$"#,##0.00';
  gTotCell.font = { bold: true, size: 11, color: { argb: "FF" + ACCENT } };
  gTotCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND } };
  gTotCell.border = cellBorder();
  gTotCell.alignment = { horizontal: "right", vertical: "middle" };

  // Grand actual total
  const gActCell = totalRow.getCell(15);
  gActCell.value = grandActual;
  gActCell.numFmt = '"$"#,##0.00';
  gActCell.font = { bold: true, size: 11, color: { argb: "FF86EFAC" } };
  gActCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND } };
  gActCell.border = cellBorder();
  gActCell.alignment = { horizontal: "right", vertical: "middle" };

  // Freeze header rows
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 3, topLeftCell: "B4" }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── Style helpers ────────────────────────────────────────────────────────────

function styleHeader(cell: ExcelJS.Cell, isActual = false) {
  cell.font = { bold: true, size: 10, color: { argb: isActual ? "FF86EFAC" : "FFF2F5FA" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND } };
  cell.border = cellBorder();
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleSubHeader(cell: ExcelJS.Cell, isActual = false) {
  cell.font = { size: 9, color: { argb: isActual ? "FF86EFAC" : "FF9AA6BF" }, italic: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND } };
  cell.border = cellBorder();
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function cellBorder(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.BorderStyle = "thin";
  const color = { argb: "FF1E3A5F" };
  return { top: { style: s, color }, left: { style: s, color }, bottom: { style: s, color }, right: { style: s, color } };
}
