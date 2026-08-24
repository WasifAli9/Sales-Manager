import crypto from "crypto";
import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { db, teamMembersTable, usersTable, teamInviteTokensTable } from "@workspace/db";
import { requireOwner } from "../middlewares/requireOwner";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { createSession, SESSION_COOKIE, SESSION_TTL, cookieSecure } from "../lib/auth";
import { appPublicUrl } from "../lib/appUrl";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────
function inviteOriginAndBase(req: import("express").Request) {
  const origin =
    process.env.APP_URL || process.env.PUBLIC_APP_URL
      ? appPublicUrl()
      : `${req.protocol}://${req.get("host")}`;
  const base = process.env.APP_URL
    ? ""
    : (process.env.APP_BASE_PATH ?? "").replace(/\/$/, "");
  return { origin, base };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

const TeamMemberInput = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  focus: z.string().optional(),
  hoursPerWeek: z.number().int().min(1).max(168).optional(),
  notes: z.string().optional(),
});

const TeamMemberUpdate = TeamMemberInput.partial();

router.get("/team", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const members = await db.select().from(teamMembersTable).orderBy(teamMembersTable.createdAt);

  // Attach invite status to each member
  const now = new Date();
  const withStatus = await Promise.all(
    members.map(async (m) => {
      const [token] = await db
        .select()
        .from(teamInviteTokensTable)
        .where(
          and(
            eq(teamInviteTokensTable.teamMemberId, m.id),
            isNull(teamInviteTokensTable.usedAt),
            isNull(teamInviteTokensTable.revokedAt),
          ),
        )
        .orderBy(teamInviteTokensTable.createdAt)
        .limit(1);

      const pendingInvite =
        token && token.expiresAt > now
          ? { email: token.email, accountRole: token.accountRole, expiresAt: token.expiresAt }
          : null;

      return { ...m, pendingInvite };
    }),
  );

  res.json(withStatus);
});

router.post("/team", requireOwner, async (req, res): Promise<void> => {
  const parsed = TeamMemberInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [member] = await db.insert(teamMembersTable).values(parsed.data).returning();
  res.status(201).json(member);
});

router.patch("/team/:id", requireOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = TeamMemberUpdate.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(teamMembersTable).set(parsed.data).where(eq(teamMembersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/team/:id", requireOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(teamMembersTable).where(eq(teamMembersTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

// ── POST /team/:id/invite ─────────────────────────────────────────────────
// Owner sends an invite email so the member sets their own password.
const InviteBody = z.object({
  email: z.email(),
  accountRole: z.enum(["member", "admin"]).optional().default("member"),
});

router.post("/team/:id/invite", requireOwner, async (req, res): Promise<void> => {
  const teamMemberId = parseInt(String(req.params.id));
  if (isNaN(teamMemberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = InviteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }

  const { email, accountRole } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, teamMemberId));
  if (!member) { res.status(404).json({ error: "Team member not found" }); return; }
  if (member.userId) { res.status(409).json({ error: "This team member already has an account." }); return; }

  // Check email not already in use by a different account
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) { res.status(409).json({ error: "An account with that email already exists." }); return; }

  // Revoke any pending invites for this member
  await db
    .update(teamInviteTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(teamInviteTokensTable.teamMemberId, teamMemberId),
        isNull(teamInviteTokensTable.usedAt),
        isNull(teamInviteTokensTable.revokedAt),
      ),
    );

  // Create new invite token (72 hour expiry)
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await db.insert(teamInviteTokensTable).values({
    teamMemberId,
    email: normalizedEmail,
    accountRole,
    tokenHash,
    expiresAt,
  });

  // Store email on member row for display
  await db.update(teamMembersTable).set({ inviteEmail: normalizedEmail }).where(eq(teamMembersTable.id, teamMemberId));

  // Build invite URL
  const { origin, base } = inviteOriginAndBase(req);
  const inviteUrl = `${origin}${base}/accept-invite?token=${rawToken}`;

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: `${req.user?.name ?? "Your team"} invited you to Sales Manager`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0B1220;color:#e2e8f0;border-radius:16px">
          <h1 style="font-size:24px;font-weight:800;margin:0 0 8px">You're invited to Sales Manager</h1>
          <p style="color:#94a3b8;margin:0 0 8px">
            <strong style="color:#e2e8f0">${member.name}</strong> (${member.role}) has been invited to join the team.
          </p>
          <p style="color:#94a3b8;margin:0 0 24px">Click the button below to set your password and get started. This link expires in 72 hours.</p>
          <a href="${inviteUrl}" style="display:inline-block;background:#22d3ee;color:#0B1220;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;font-size:15px">Accept invitation</a>
          <p style="color:#475569;font-size:12px;margin:24px 0 0">If you weren't expecting this, you can safely ignore it.</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send invite email");
    // Don't fail the request — the token is stored, owner can resend
  }

  res.status(201).json({ success: true, email: normalizedEmail, expiresAt });
});

// ── DELETE /team/:id/invite ───────────────────────────────────────────────
// Owner revokes any pending invite for a team member.
router.delete("/team/:id/invite", requireOwner, async (req, res): Promise<void> => {
  const teamMemberId = parseInt(String(req.params.id));
  if (isNaN(teamMemberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(teamInviteTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(teamInviteTokensTable.teamMemberId, teamMemberId),
        isNull(teamInviteTokensTable.usedAt),
        isNull(teamInviteTokensTable.revokedAt),
      ),
    );

  res.status(204).send();
});

// ── POST /team/accept-invite ──────────────────────────────────────────────
// Public endpoint: validates invite token, creates user, signs them in.
const AcceptInviteBody = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

router.post("/team/accept-invite", async (req, res): Promise<void> => {
  const parsed = AcceptInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
    return;
  }

  const { token, password } = parsed.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const [record] = await db
    .select()
    .from(teamInviteTokensTable)
    .where(eq(teamInviteTokensTable.tokenHash, tokenHash));

  if (!record) {
    res.status(400).json({ error: "This invite link is invalid or has expired." });
    return;
  }
  if (record.revokedAt) {
    res.status(400).json({ error: "This invite has been revoked." });
    return;
  }
  if (record.usedAt) {
    res.status(400).json({ error: "This invite has already been used." });
    return;
  }
  if (record.expiresAt < new Date()) {
    res.status(400).json({ error: "This invite link has expired. Ask the owner to resend it." });
    return;
  }

  // Fetch team member
  const [member] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.id, record.teamMemberId));
  if (!member) {
    res.status(400).json({ error: "Team member record not found." });
    return;
  }
  if (member.userId) {
    res.status(409).json({ error: "This team member already has an account." });
    return;
  }

  // Check email not already taken
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, record.email));
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }

  // Create the user
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({
      email: record.email,
      passwordHash,
      name: member.name,
      role: record.accountRole as "member" | "admin",
    })
    .returning();

  // Link member → user and mark token used
  await Promise.all([
    db.update(teamMembersTable)
      .set({ userId: user.id, inviteEmail: record.email })
      .where(eq(teamMembersTable.id, record.teamMemberId)),
    db.update(teamInviteTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(teamInviteTokensTable.id, record.id)),
  ]);

  // Sign in the new user
  const publicUser = {
    id: user.id,
    email: user.email,
    role: user.role ?? "member",
    name: user.name ?? null,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
    linkedinUrl: null,
  };

  const sid = await createSession({ user: publicUser });
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });

  res.status(201).json({ user: publicUser, sid });
});

// ── POST /team/:id/create-account ─────────────────────────────────────────
// Legacy: Owner directly creates a login (kept for backwards compatibility).
const CreateAccountBody = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  accountRole: z.enum(["member", "admin"]).optional().default("member"),
});

router.post("/team/:id/create-account", requireOwner, async (req, res): Promise<void> => {
  const teamMemberId = parseInt(String(req.params.id));
  if (isNaN(teamMemberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }

  const { email, password, accountRole } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, teamMemberId));
  if (!member) { res.status(404).json({ error: "Team member not found" }); return; }
  if (member.userId) { res.status(409).json({ error: "This team member already has an account." }); return; }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) { res.status(409).json({ error: "An account with that email already exists." }); return; }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, passwordHash, name: member.name, role: accountRole })
    .returning();

  await db.update(teamMembersTable)
    .set({ userId: user.id, inviteEmail: normalizedEmail })
    .where(eq(teamMembersTable.id, teamMemberId));

  res.status(201).json({ userId: user.id, email: user.email, name: user.name, role: user.role });
});

// ── DELETE /team/:id/remove-account ──────────────────────────────────────
router.delete("/team/:id/remove-account", requireOwner, async (req, res): Promise<void> => {
  const teamMemberId = parseInt(String(req.params.id));
  if (isNaN(teamMemberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, teamMemberId));
  if (!member) { res.status(404).json({ error: "Team member not found" }); return; }
  if (!member.userId) { res.status(404).json({ error: "No account linked to this team member." }); return; }

  await db.update(teamMembersTable).set({ userId: null, inviteEmail: null }).where(eq(teamMembersTable.id, teamMemberId));
  await db.delete(usersTable).where(eq(usersTable.id, member.userId));

  res.status(204).send();
});

export default router;
