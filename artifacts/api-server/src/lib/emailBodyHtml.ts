/**
 * Normalize email body content for the rich-text editor / HTML sends.
 * Plain text (common from AI generation) becomes paragraph HTML so TipTap
 * preserves line breaks instead of collapsing into one block.
 */
export function emailBodyToHtml(body: string): string {
  const trimmed = body.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";

  // Already HTML — leave as-is
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;

  const withBreaks = ensureParagraphBreaks(trimmed);
  const escaped = withBreaks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * If the model returned a single run-on block, insert blank lines between
 * short paragraphs so the editor can show readable spacing.
 */
function ensureParagraphBreaks(text: string): string {
  if (/\n\s*\n/.test(text)) return text;

  // Put a greeting on its own line when the rest of the email follows on the same line.
  const withGreeting = text.replace(
    /^(Hi\s+\{\{firstName\}\},|Hi\s+[A-Z][\w'-]*,|Hello\s+\{\{firstName\}\},|Hello\s+[A-Z][\w'-]*,)\s+/i,
    "$1\n\n",
  );

  // Split into sentences, then group into short paragraphs of 1–2 sentences.
  // Also treat "{{" merge-field starts as sentence boundaries after punctuation.
  const sentences = withGreeting
    .split(/(?<=[.!?])\s+(?=[A-Z{{])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 1) return withGreeting;

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(" "));
  }
  return paragraphs.join("\n\n");
}
