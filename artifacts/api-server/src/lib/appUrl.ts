/** Public origin for emails, OAuth callbacks, and invite links. */
export function appPublicUrl(): string {
  const url =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://salesmanager.creativecloud.ai";
  return url.replace(/\/$/, "");
}
