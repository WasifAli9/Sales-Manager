/**
 * OAuth flows for LinkedIn Company Page and Instagram Business (via Facebook).
 *
 * Requires env vars:
 *   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 *   FACEBOOK_APP_ID,    FACEBOOK_APP_SECRET
 *
 * These are optional — if absent the platform shows a manual-token fallback.
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { socialAccountsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getOrigin(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")}`;
}

/** Frontend base path — matches vite's BASE_PATH env var */
function getFrontendBase(): string {
  if (process.env.APP_URL || process.env.PUBLIC_APP_URL) {
    return (process.env.BASE_PATH ?? "").replace(/\/$/, "");
  }
  return (process.env.BASE_PATH ?? "/closer").replace(/\/$/, "");
}

/** CSRF-safe state parameter: base64url-encoded JSON, HMAC-signed */
function makeState(data: Record<string, unknown>): string {
  const payload = JSON.stringify({ ...data, ts: Date.now() });
  const sig = crypto
    .createHmac("sha256", process.env.SESSION_SECRET ?? "dev")
    .update(payload)
    .digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

function parseState(state: string): Record<string, unknown> | null {
  try {
    const { payload, sig } = JSON.parse(
      Buffer.from(state, "base64url").toString(),
    ) as { payload: string; sig: string };
    const expected = crypto
      .createHmac("sha256", process.env.SESSION_SECRET ?? "dev")
      .update(payload)
      .digest("hex");
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))
    ) {
      return null;
    }
    const data = JSON.parse(payload) as Record<string, unknown>;
    if (typeof data.ts === "number" && Date.now() - data.ts > 15 * 60 * 1000) {
      return null; // 15-min expiry
    }
    return data;
  } catch {
    return null;
  }
}

async function upsertAccount(
  productId: number,
  platform: string,
  accessToken: string,
  accountId: string,
  accountName: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(socialAccountsTable)
    .where(
      and(
        eq(socialAccountsTable.productId, productId),
        eq(socialAccountsTable.platform, platform),
      ),
    )
    .limit(1);

  if (existing.length) {
    await db
      .update(socialAccountsTable)
      .set({ accessToken, accountId, accountName, updatedAt: new Date() })
      .where(eq(socialAccountsTable.id, existing[0].id));
  } else {
    await db.insert(socialAccountsTable).values({
      productId,
      platform,
      accessToken,
      accountId,
      accountName,
    });
  }
}

// ── GET /api/social-auth/config ───────────────────────────────────────────────
// Returns which platforms have OAuth credentials configured.
// The frontend uses this to decide whether to show OAuth buttons or manual forms.
router.get("/social-auth/config", (_req: Request, res: Response) => {
  res.json({
    linkedin:  !!(process.env.LINKEDIN_CLIENT_ID  && process.env.LINKEDIN_CLIENT_SECRET),
    instagram: !!(process.env.FACEBOOK_APP_ID     && process.env.FACEBOOK_APP_SECRET),
  });
});

// ── LinkedIn ──────────────────────────────────────────────────────────────────

router.get("/social-auth/linkedin", (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) { res.status(400).json({ error: "LinkedIn OAuth not configured" }); return; }

  const productId = parseInt(String(req.query.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "productId required" }); return; }

  const origin      = getOrigin(req);
  const redirectUri = `${origin}/api/social-auth/linkedin/callback`;
  const state       = makeState({ productId, userId: req.user.id });
  const scope       = "w_organization_social r_organization_social rw_organization_admin r_basicprofile";

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  res.redirect(url.toString());
});

router.get("/social-auth/linkedin/callback", async (req: Request, res: Response) => {
  const origin       = getOrigin(req);
  const frontendBase = getFrontendBase();
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`${origin}${frontendBase}?oauth_error=linkedin_denied`);
    return;
  }

  const stateData = parseState(state ?? "");
  if (!stateData) {
    res.redirect(`${origin}${frontendBase}?oauth_error=invalid_state`);
    return;
  }

  const productId  = stateData.productId  as number;
  const redirectUri = `${origin}/api/social-auth/linkedin/callback`;

  try {
    // ── Exchange code for access token ────────────────────────────────────────
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri:  redirectUri,
        client_id:     process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
    const { access_token } = await tokenRes.json() as { access_token: string };

    // ── Fetch administrated organizations ─────────────────────────────────────
    let accountId   = "";
    let accountName = "";
    try {
      const orgsRes = await fetch(
        "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
        { headers: { Authorization: `Bearer ${access_token}`, "LinkedIn-Version": "202304" } },
      );
      if (orgsRes.ok) {
        const orgsData = await orgsRes.json() as {
          elements?: Array<{ organizationalTarget: string }>;
        };
        const urn = orgsData.elements?.[0]?.organizationalTarget;
        if (urn) {
          accountId = urn;
          // Fetch org display name
          const orgId  = urn.split(":").pop()!;
          const nameRes = await fetch(
            `https://api.linkedin.com/v2/organizations/${orgId}?fields=localizedName`,
            { headers: { Authorization: `Bearer ${access_token}`, "LinkedIn-Version": "202304" } },
          );
          if (nameRes.ok) {
            const nd = await nameRes.json() as { localizedName?: string };
            accountName = nd.localizedName ?? "";
          }
        }
      }
    } catch (orgErr) {
      logger.warn({ orgErr }, "social-auth: could not fetch LinkedIn organizations — saving token only");
    }

    await upsertAccount(productId, "linkedin", access_token, accountId, accountName);
    logger.info({ productId, accountName }, "social-auth: LinkedIn connected");
    res.redirect(`${origin}${frontendBase}/products/${productId}/social?connected=linkedin`);
  } catch (err) {
    logger.error({ err }, "social-auth: LinkedIn callback failed");
    res.redirect(`${origin}${frontendBase}/products/${productId}/social?oauth_error=linkedin_failed`);
  }
});

// ── Facebook / Instagram ──────────────────────────────────────────────────────

router.get("/social-auth/facebook", (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) { res.status(400).json({ error: "Facebook OAuth not configured" }); return; }

  const productId = parseInt(String(req.query.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "productId required" }); return; }

  const origin      = getOrigin(req);
  const redirectUri = `${origin}/api/social-auth/facebook/callback`;
  const state       = makeState({ productId, userId: req.user.id });
  const scope       = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
  ].join(",");

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  res.redirect(url.toString());
});

router.get("/social-auth/facebook/callback", async (req: Request, res: Response) => {
  const origin       = getOrigin(req);
  const frontendBase = getFrontendBase();
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`${origin}${frontendBase}?oauth_error=instagram_denied`);
    return;
  }

  const stateData = parseState(state ?? "");
  if (!stateData) {
    res.redirect(`${origin}${frontendBase}?oauth_error=invalid_state`);
    return;
  }

  const productId  = stateData.productId as number;
  const redirectUri = `${origin}/api/social-auth/facebook/callback`;
  const appId      = process.env.FACEBOOK_APP_ID!;
  const appSecret  = process.env.FACEBOOK_APP_SECRET!;

  try {
    // ── Exchange code for short-lived user token ──────────────────────────────
    const shortRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, client_secret: appSecret, code }),
    );
    if (!shortRes.ok) throw new Error(`FB token exchange failed: ${await shortRes.text()}`);
    const { access_token: shortToken } = await shortRes.json() as { access_token: string };

    // ── Exchange for long-lived user token ────────────────────────────────────
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken }),
    );
    const userToken = longRes.ok
      ? ((await longRes.json() as { access_token: string }).access_token)
      : shortToken;

    // ── Get Facebook pages ────────────────────────────────────────────────────
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`,
    );
    if (!pagesRes.ok) throw new Error("Failed to fetch Facebook pages — ensure Pages permission is granted");
    const pagesData = await pagesRes.json() as {
      data: Array<{ id: string; name: string; access_token: string }>;
    };

    // ── Find first page with a connected Instagram Business Account ───────────
    let igId        = "";
    let igName      = "";
    let igPageToken = "";

    for (const page of pagesData.data ?? []) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}` +
          `?fields=instagram_business_account{id,name,username}&access_token=${page.access_token}`,
      );
      if (!igRes.ok) continue;
      const igData = await igRes.json() as {
        instagram_business_account?: { id: string; name?: string; username?: string };
      };
      const iga = igData.instagram_business_account;
      if (iga?.id) {
        igId        = iga.id;
        igName      = iga.name ?? iga.username ?? page.name;
        igPageToken = page.access_token;
        break;
      }
    }

    if (!igId) throw new Error("No Instagram Business Account found — connect one to a Facebook Page in Meta Business Suite");

    await upsertAccount(productId, "instagram", igPageToken, igId, igName);
    logger.info({ productId, igName }, "social-auth: Instagram connected");
    res.redirect(`${origin}${frontendBase}/products/${productId}/social?connected=instagram`);
  } catch (err) {
    logger.error({ err }, "social-auth: Facebook/Instagram callback failed");
    const msg = err instanceof Error ? encodeURIComponent(err.message) : "instagram_failed";
    res.redirect(`${origin}${frontendBase}/products/${productId}/social?oauth_error=${msg}`);
  }
});

export default router;
