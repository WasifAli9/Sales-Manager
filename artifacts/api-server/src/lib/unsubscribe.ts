import { randomUUID } from "crypto";
import { appPublicUrl } from "./appUrl";

export type UnsubscribeFooterConfig = {
  productName?: string | null;
  footerText?: string | null;
  senderLabel?: string | null;
  supportEmail?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicAppUrl(): string {
  return appPublicUrl();
}

export function createUnsubscribeToken(): string {
  return randomUUID();
}

export function unsubscribeUrl(token: string): string {
  return `${publicAppUrl()}/api/unsubscribe/${encodeURIComponent(token)}`;
}

export function unsubscribeHeaders(token: string): Record<string, string> {
  const url = unsubscribeUrl(token);
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function stripUnsubscribeFooter(body: string): string {
  const marker = 'data-closer-unsubscribe="true"';
  const idx = body.indexOf(marker);
  if (idx < 0) return body;
  const hrIdx = body.lastIndexOf("<hr", idx);
  return hrIdx >= 0 ? body.slice(0, hrIdx).trimEnd() : body.slice(0, idx).trimEnd();
}

export function appendUnsubscribeFooter(
  body: string,
  token: string,
  config: UnsubscribeFooterConfig,
): string {
  const url = unsubscribeUrl(token);
  const sender = config.senderLabel?.trim() || config.productName?.trim() || "our team";
  const footerText = config.footerText?.trim()
    || `You are receiving this email from ${sender}.`;
  const support = config.supportEmail?.trim();

  if (body.trimStart().startsWith("<")) {
    const footer = `<hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0 16px"><div data-closer-unsubscribe="true" style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#6b7280">${escapeHtml(footerText)}<br><a href="${escapeHtml(url)}" style="color:#4f46e5">Unsubscribe from future emails</a>${support ? `<br>Questions? <a href="mailto:${escapeHtml(support)}" style="color:#4f46e5">${escapeHtml(support)}</a>` : ""}</div>`;
    return body.includes("</body>") ? body.replace("</body>", `${footer}</body>`) : `${body}${footer}`;
  }

  return `${body}\n\n---\n${footerText}\nUnsubscribe from future emails: ${url}${support ? `\nQuestions? ${support}` : ""}`;
}