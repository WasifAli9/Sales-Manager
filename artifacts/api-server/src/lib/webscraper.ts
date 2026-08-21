/**
 * Fetch a website and return clean readable text for AI analysis.
 * Strips scripts, styles, and HTML tags; trims to a token-safe length.
 */
export async function scrapeWebsite(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CloserBot/1.0; +https://closer.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const text = html
    // Remove <script> blocks
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    // Remove <style> blocks
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Remove all remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Cap at ~12 000 chars (~3 000 tokens) — enough to get the full picture
  return text.slice(0, 12_000);
}
