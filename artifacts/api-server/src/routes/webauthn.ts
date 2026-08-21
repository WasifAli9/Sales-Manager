import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { db, webauthnCredentialsTable, usersTable } from "@workspace/db";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  cookieSecure,
  type SessionData,
} from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// In-memory challenge store (TTL 5 min) — keyed by userId for registration,
// by a short random key for authentication.
const challenges = new Map<string, { challenge: string; expiresAt: number; userId?: string }>();

function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of challenges) {
    if (v.expiresAt < now) challenges.delete(k);
  }
}

function getRpId(req: Request): string {
  const fwdHost = req.headers["x-forwarded-host"];
  const host =
    (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) ||
    req.headers["host"] ||
    "localhost";
  // Strip port if present
  return (host as string).split(":")[0];
}

function getOrigin(req: Request): string {
  const fwdProto = req.headers["x-forwarded-proto"];
  const proto =
    (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)?.split(",")[0].trim() ||
    "https";
  return `${proto}://${getRpId(req)}`;
}

// ── Registration ───────────────────────────────────────────────────────────────

router.post("/webauthn/register/options", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = req.user!;
  purgeExpired();

  // Existing credentials for this user (to exclude)
  const existing = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.userId, user.id));

  const options = await generateRegistrationOptions({
    rpName: "Closer",
    rpID: getRpId(req),
    userName: user.email ?? user.id,
    userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Closer User",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports
        ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
        : [],
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  challenges.set(`reg:${user.id}`, {
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
    userId: user.id,
  });

  res.json(options);
});

router.post("/webauthn/register/verify", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = req.user!;
  const stored = challenges.get(`reg:${user.id}`);

  if (!stored || stored.expiresAt < Date.now()) {
    res.status(400).json({ error: "Challenge expired — start registration again" });
    return;
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: stored.challenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: "Verification failed" });
      return;
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    challenges.delete(`reg:${user.id}`);

    await db.insert(webauthnCredentialsTable).values({
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports
        ? JSON.stringify(credential.transports)
        : null,
    });

    res.json({ verified: true });
  } catch (err) {
    logger.error({ err }, "WebAuthn registration verification error");
    res.status(400).json({ error: "Registration failed" });
  }
});

// ── Authentication ─────────────────────────────────────────────────────────────

router.post("/webauthn/authenticate/options", async (req: Request, res: Response) => {
  purgeExpired();

  const options = await generateAuthenticationOptions({
    rpID: getRpId(req),
    userVerification: "required",
    // No allowCredentials — resident key / discoverable credential flow
  });

  const key = `auth:${options.challenge.slice(0, 16)}`;
  challenges.set(key, {
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  // Return the key so the client sends it back in verify
  res.json({ ...options, _key: key });
});

router.post("/webauthn/authenticate/verify", async (req: Request, res: Response) => {
  const { _key, ...body } = req.body;

  const stored = challenges.get(_key);
  if (!stored || stored.expiresAt < Date.now()) {
    res.status(400).json({ error: "Challenge expired" });
    return;
  }

  // Look up the credential by its raw id
  const credentialId = body.id as string;
  const [cred] = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.credentialId, credentialId));

  if (!cred) {
    res.status(400).json({ error: "Credential not found" });
    return;
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: stored.challenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      credential: {
        id: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey, "base64url"),
        counter: cred.counter,
        transports: cred.transports
          ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
          : [],
      },
    });

    if (!verification.verified) {
      res.status(400).json({ error: "Verification failed" });
      return;
    }

    challenges.delete(_key);

    // Update counter
    await db
      .update(webauthnCredentialsTable)
      .set({ counter: verification.authenticationInfo.newCounter })
      .where(eq(webauthnCredentialsTable.id, cred.id));

    // Load user and create a session
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, cred.userId));

    if (!dbUser) {
      res.status(400).json({ error: "User not found" });
      return;
    }

    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email ?? "",
        role: (dbUser as any).role ?? "owner",
        name: (dbUser as any).name ?? null,
        firstName: dbUser.firstName ?? null,
        lastName: dbUser.lastName ?? null,
        profileImageUrl: dbUser.profileImageUrl ?? null,
      },
    };

    const sid = await createSession(sessionData);

    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL,
    });

    res.json({ verified: true, user: sessionData.user });
  } catch (err) {
    logger.error({ err }, "WebAuthn authentication verification error");
    res.status(400).json({ error: "Authentication failed" });
  }
});

// ── List / delete credentials ──────────────────────────────────────────────────

router.get("/webauthn/credentials", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const creds = await db
    .select({
      id: webauthnCredentialsTable.id,
      deviceType: webauthnCredentialsTable.deviceType,
      backedUp: webauthnCredentialsTable.backedUp,
      createdAt: webauthnCredentialsTable.createdAt,
    })
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.userId, req.user!.id));

  res.json({ credentials: creds });
});

router.delete("/webauthn/credentials/:id", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const credId = parseInt(req.params.id as string, 10);
  const [cred] = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.id, credId));

  if (!cred || cred.userId !== req.user!.id) {
    res.status(404).json({ error: "Credential not found" });
    return;
  }

  await db
    .delete(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.id, credId));

  res.json({ deleted: true });
});

export default router;
