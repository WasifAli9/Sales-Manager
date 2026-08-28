/** Company name/domain normalization for Lead Intelligence dedupe. */

export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name?.trim()) return "";
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(ltd|limited|llc|inc|incorporated|corp|corporation|co|plc|gmbh|sa|bv|pty)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDomain(websiteOrUrl: string | null | undefined): string | null {
  if (!websiteOrUrl?.trim()) return null;
  let value = websiteOrUrl.trim().toLowerCase();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (!host || !host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

export function normalizeWebsite(websiteOrUrl: string | null | undefined): string | null {
  if (!websiteOrUrl?.trim()) return null;
  let value = websiteOrUrl.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

export function parseEmployeeCount(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const text = String(raw).replace(/,/g, "").trim();
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const single = text.match(/(\d+)/);
  return single ? Number(single[1]) : null;
}
