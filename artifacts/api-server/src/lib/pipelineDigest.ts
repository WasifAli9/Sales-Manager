import { and, between, isNotNull, lte, sql } from "drizzle-orm";
import { db, pipelineDealsTable, productsTable, usersTable, digestLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "./email";
import { logger } from "./logger";

function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const domain = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://closer.replit.app";
  const base = (process.env.APP_BASE_PATH ?? "/closer").replace(/\/$/, "");
  return `${domain}${base}`;
}

interface DealRow {
  id: number;
  productId: number;
  productName: string;
  contactName: string;
  companyName: string | null;
  value: string;
  stage: string;
  nextReviewDate: string | null;
}

type DealWithDate = DealRow & { nextReviewDate: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stageLabel(stage: string): string {
  return escapeHtml(stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
}

function formatDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day!));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function groupByProduct(deals: DealWithDate[]): Map<string, { productId: number; deals: DealWithDate[] }> {
  const map = new Map<string, { productId: number; deals: DealWithDate[] }>();
  for (const deal of deals) {
    const existing = map.get(deal.productName);
    if (existing) {
      existing.deals.push(deal);
    } else {
      map.set(deal.productName, { productId: deal.productId, deals: [deal] });
    }
  }
  return map;
}

function dealRow(deal: DealWithDate, base: string, today: string, _accent: string): string {
  const isOverdue = deal.nextReviewDate < today;
  const reviewLabel = isOverdue
    ? `<span style="color:#F87171;font-size:11px;font-weight:700;">OVERDUE · ${formatDate(deal.nextReviewDate)}</span>`
    : `<span style="color:#4DD4C1;font-size:11px;font-weight:700;">TODAY</span>`;
  const contactName = escapeHtml(deal.contactName);
  const company = deal.companyName ? ` · ${escapeHtml(deal.companyName)}` : "";
  const val = parseFloat(deal.value) > 0
    ? `<span style="color:#9AA6BF;font-size:12px;">$${Number(deal.value).toLocaleString()}</span> &nbsp;`
    : "";
  const pipelineUrl = `${base}/pipeline?productId=${deal.productId}`;
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #1E2D45;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <a href="${pipelineUrl}" style="color:#F2F5FA;font-weight:600;font-size:14px;text-decoration:none;">${contactName}${company}</a>
          <div style="margin-top:3px;">${val}<span style="color:#6B7A99;font-size:12px;">${stageLabel(deal.stage)}</span></div>
        </div>
        <div style="text-align:right;min-width:80px;">${reviewLabel}</div>
      </div>
    </td>
  </tr>`;
}

function upcomingRow(deal: DealWithDate): string {
  const contactName = escapeHtml(deal.contactName);
  const company = deal.companyName ? ` · ${escapeHtml(deal.companyName)}` : "";
  return `
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #1A2640;">
      <span style="color:#9AA6BF;font-size:13px;">${contactName}${company}</span>
      <span style="float:right;color:#4DD4C1;font-size:12px;">${formatDate(deal.nextReviewDate)}</span>
    </td>
  </tr>`;
}

function buildEmail(
  dueTodayDeals: DealWithDate[],
  upcomingDeals: DealWithDate[],
  today: string,
  base: string,
): string {
  const dateLabel = formatDate(today);
  const grouped = groupByProduct(dueTodayDeals);

  let dueSection = "";
  if (dueTodayDeals.length === 0) {
    dueSection = `<p style="color:#6B7A99;font-size:14px;margin:12px 0;">No reviews due today. Clear pipeline 🎯</p>`;
  } else {
    for (const [productName, { productId, deals }] of grouped) {
      const pipelineUrl = `${base}/pipeline?productId=${productId}`;
      dueSection += `
      <div style="margin-bottom:20px;">
        <a href="${pipelineUrl}" style="color:#4DD4C1;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">${escapeHtml(productName)}</a>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;">
          <tbody>
            ${deals.map((d) => dealRow(d, base, today, "#4DD4C1")).join("")}
          </tbody>
        </table>
      </div>`;
    }
  }

  let upcomingSection = "";
  if (upcomingDeals.length > 0) {
    upcomingSection = `
    <div style="margin-top:28px;">
      <p style="color:#9AA6BF;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px;">NEXT 7 DAYS</p>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          ${upcomingDeals.map(upcomingRow).join("")}
        </tbody>
      </table>
    </div>`;
  }

  const overdueCount = dueTodayDeals.filter((d) => d.nextReviewDate < today).length;
  const todayCount = dueTodayDeals.filter((d) => d.nextReviewDate === today).length;

  const summaryParts: string[] = [];
  if (overdueCount > 0) summaryParts.push(`<span style="color:#F87171;font-weight:700;">${overdueCount} overdue</span>`);
  if (todayCount > 0) summaryParts.push(`<span style="color:#4DD4C1;font-weight:700;">${todayCount} due today</span>`);
  const summary = summaryParts.length > 0 ? summaryParts.join(" · ") : `<span style="color:#6B7A99;">All clear</span>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0B1220;color:#F2F5FA;padding:24px;margin:0;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:#131C2E;border:1px solid #2A3550;border-radius:16px;padding:28px;">

      <!-- Header -->
      <p style="color:#4DD4C1;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px;">CLOSER · PIPELINE DIGEST · ${dateLabel}</p>
      <h1 style="font-size:20px;font-weight:800;margin:0 0 4px;line-height:1.3;">Your review queue</h1>
      <p style="color:#6B7A99;font-size:13px;margin:0 0 24px;">${summary} · ${upcomingDeals.length} upcoming this week</p>

      <!-- Due today / overdue -->
      <div>
        <p style="color:#9AA6BF;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 12px;">DUE TODAY &amp; OVERDUE</p>
        ${dueSection}
      </div>

      ${upcomingSection}

      <!-- CTA -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #1E2D45;">
        <a href="${base}/pipeline" style="display:inline-block;background:#4DD4C1;color:#0B1220;padding:11px 22px;border-radius:10px;font-weight:700;font-size:13px;text-decoration:none;">Open Pipeline</a>
      </div>
    </div>

    <p style="color:#3A4660;font-size:11px;text-align:center;margin-top:16px;">Closer · Daily digest · Sent each morning at 7 AM</p>
  </div>
</body>
</html>`;
}

export async function sendPipelineDigest(): Promise<{ sent: number; skipped: string }> {
  const today = new Date().toISOString().slice(0, 10);

  // Atomic once-per-day lock: INSERT wins the lock; a conflict means another
  // instance already sent today's digest, so we skip to avoid duplicates.
  const locked = await db
    .insert(digestLogTable)
    .values({ digestType: "pipeline_daily", digestDate: today })
    .onConflictDoNothing()
    .returning({ id: digestLogTable.id });

  if (locked.length === 0) {
    logger.info({ today }, "Pipeline digest already sent today — skipping");
    return { sent: 0, skipped: "already sent today" };
  }

  // Compute 7-days-from-now date string
  const d7 = new Date();
  d7.setDate(d7.getDate() + 7);
  const nextWeek = d7.toISOString().slice(0, 10);

  // Tomorrow (exclusive lower bound for upcoming — don't include today)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const [dueTodayRows, upcomingRows, allUsers] = await Promise.all([
    // Overdue + today
    db
      .select({
        id: pipelineDealsTable.id,
        productId: pipelineDealsTable.productId,
        productName: productsTable.name,
        contactName: pipelineDealsTable.contactName,
        companyName: pipelineDealsTable.companyName,
        value: pipelineDealsTable.value,
        stage: pipelineDealsTable.stage,
        nextReviewDate: pipelineDealsTable.nextReviewDate,
      })
      .from(pipelineDealsTable)
      .innerJoin(productsTable, eq(pipelineDealsTable.productId, productsTable.id))
      .where(and(isNotNull(pipelineDealsTable.nextReviewDate), lte(pipelineDealsTable.nextReviewDate, today)))
      .orderBy(pipelineDealsTable.nextReviewDate),

    // Next 7 days (tomorrow through +7 days)
    db
      .select({
        id: pipelineDealsTable.id,
        productId: pipelineDealsTable.productId,
        productName: productsTable.name,
        contactName: pipelineDealsTable.contactName,
        companyName: pipelineDealsTable.companyName,
        value: pipelineDealsTable.value,
        stage: pipelineDealsTable.stage,
        nextReviewDate: pipelineDealsTable.nextReviewDate,
      })
      .from(pipelineDealsTable)
      .innerJoin(productsTable, eq(pipelineDealsTable.productId, productsTable.id))
      .where(
        and(
          isNotNull(pipelineDealsTable.nextReviewDate),
          between(pipelineDealsTable.nextReviewDate, tomorrowStr, nextWeek),
        ),
      )
      .orderBy(pipelineDealsTable.nextReviewDate),

    db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable),
  ]);

  const dueDeals = dueTodayRows.filter((d): d is DealWithDate => d.nextReviewDate !== null);
  const upcoming = upcomingRows.filter((d): d is DealWithDate => d.nextReviewDate !== null);

  if (allUsers.length === 0) {
    logger.info("Pipeline digest: no users found, skipping");
    return { sent: 0, skipped: "no users" };
  }

  const base = appUrl();
  const html = buildEmail(dueDeals, upcoming, today, base);

  const overdueCount = dueDeals.filter((d) => d.nextReviewDate < today).length;
  const todayCount = dueDeals.filter((d) => d.nextReviewDate === today).length;
  const subject =
    overdueCount > 0
      ? `Pipeline digest: ${overdueCount} overdue + ${todayCount} due today`
      : todayCount > 0
        ? `Pipeline digest: ${todayCount} review${todayCount === 1 ? "" : "s"} due today`
        : `Pipeline digest: all clear for ${today}`;

  let sent = 0;
  for (const user of allUsers) {
    await sendEmail({ to: user.email, subject, html });
    sent++;
  }

  logger.info({ sent, dueDeals: dueDeals.length, upcoming: upcoming.length }, "Pipeline digest sent");
  return { sent, skipped: "none" };
}
