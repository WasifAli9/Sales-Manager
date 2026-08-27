/** Format and append email signatures while preserving HTML line spacing. */

function looksLikeHtml(value: string): boolean {
  return /<(?:p|br|div|span|a|strong|em|ul|ol|li|h[1-6]|table|img|hr)\b/i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextToHtml(value: string): string {
  const paragraphs = value.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (!paragraphs.length) return "";
  return paragraphs
    .map(p => `<p style="margin:0 0 12px 0;line-height:1.65;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Inner signature HTML for template slots (no wrapper/separator). */
export function signatureContentHtml(signature: string | null | undefined): string {
  if (!signature?.trim()) return "";
  const trimmed = signature.trim();
  return looksLikeHtml(trimmed) ? trimmed : plainTextToHtml(trimmed);
}

/** Append signature after body with spacing (email-safe HTML). */
export function appendSignatureHtml(bodyHtml: string, signature: string | null | undefined): string {
  const content = signatureContentHtml(signature);
  if (!content) return bodyHtml;
  if (bodyHtml.includes('data-email-signature="1"')) return bodyHtml;

  return `${bodyHtml}<div data-email-signature="1" style="margin-top:24px;padding-top:16px;font-size:14px;line-height:1.65;color:#334155;">${content}</div>`;
}
