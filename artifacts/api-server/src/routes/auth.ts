import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db, usersTable, passwordResetTokensTable } from '@workspace/db';
import {
  clearSession,
  createSession,
  deleteSession,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
  cookieSecure,
} from '../lib/auth';
import { sendEmail } from '../lib/email';
import { logger } from '../lib/logger';

const router = Router();

// ─── helpers ──────────────────────────────────────────────────────────────

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

function userToPublic(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    role: u.role ?? 'owner',
    name: u.name ?? null,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    profileImageUrl: u.profileImageUrl ?? null,
    linkedinUrl: u.linkedinUrl ?? null,
  };
}

// ─── GET /auth/user ────────────────────────────────────────────────────────
router.get('/auth/user', (req: Request, res: Response) => {
  res.json({ user: req.isAuthenticated() ? req.user : null });
});

// ─── POST /auth/login ──────────────────────────────────────────────────────
const LoginBody = z.object({
  email: z.email(),
  password: z.string().min(1),
});

router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const sid = await createSession({ user: userToPublic(user) });
  setSessionCookie(res, sid);
  // Also include sid in the JSON body so native clients (React Native / Expo)
  // can store and reuse it as a Bearer token — RN's fetch does not expose
  // the Set-Cookie response header (forbidden header per Fetch spec).
  res.json({ user: userToPublic(user), sid });
});

// ─── POST /auth/logout ─────────────────────────────────────────────────────
router.post('/auth/logout', async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

// ─── POST /auth/register ───────────────────────────────────────────────────
const RegisterBody = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  name: z.string().min(1).optional(),
});

router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { email, password, name } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (existing) {
    res.status(409).json({ error: 'An account with that email already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, passwordHash, name: name ?? null })
    .returning();

  const sid = await createSession({ user: userToPublic(user) });
  setSessionCookie(res, sid);
  res.status(201).json({ user: userToPublic(user) });
});

// ─── POST /auth/forgot-password ────────────────────────────────────────────
const ForgotBody = z.object({ email: z.email() });

router.post('/auth/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const parsed = ForgotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email required.' });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  // Always respond success to prevent email enumeration
  if (!user) {
    res.json({ success: true });
    return;
  }

  // Create a reset token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // Build reset URL — APP_URL takes priority (production custom domain)
  const origin =
    process.env.APP_URL?.replace(/\/$/, '') ??
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `${req.protocol}://${req.get('host')}`);
  const base = process.env.APP_URL ? '' : (process.env.APP_BASE_PATH ?? '/closer').replace(/\/$/, '');
  const resetUrl = `${origin}${base}/reset-password?token=${rawToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Reset your Closer password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0B1220;color:#e2e8f0;border-radius:16px">
          <h1 style="font-size:24px;font-weight:800;margin:0 0 8px">Reset your password</h1>
          <p style="color:#94a3b8;margin:0 0 24px">Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#22d3ee;color:#0B1220;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;font-size:15px">Set new password</a>
          <p style="color:#475569;font-size:12px;margin:24px 0 0">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to send password reset email');
  }

  res.json({ success: true });
});

// ─── POST /auth/reset-password ─────────────────────────────────────────────
const ResetBody = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

router.post('/auth/reset-password', async (req: Request, res: Response): Promise<void> => {
  const parsed = ResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { token, password } = parsed.data;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.tokenHash, tokenHash));

  if (!record || record.expiresAt < new Date() || record.usedAt) {
    res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, record.userId));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, record.id));

  res.json({ success: true });
});

// ─── POST /auth/change-password ────────────────────────────────────────────
const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
});

router.post('/auth/change-password', async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!user?.passwordHash) {
    res.status(400).json({ error: 'No password set on this account.' });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  res.json({ success: true });
});

// ─── PATCH /auth/profile ───────────────────────────────────────────────────
const UpdateProfileBody = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  profileImageUrl: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
});

router.patch('/auth/profile', async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Not authenticated.' }); return; }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { name, email, profileImageUrl, linkedinUrl } = parsed.data;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) set.name = name;
  if (email !== undefined) {
    // check uniqueness
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing && existing.id !== req.user.id) {
      res.status(400).json({ error: 'That email is already in use.' });
      return;
    }
    set.email = email;
  }
  if (profileImageUrl !== undefined) set.profileImageUrl = profileImageUrl ?? null;
  if (linkedinUrl !== undefined) set.linkedinUrl = linkedinUrl?.trim() || null;

  const [updated] = await db
    .update(usersTable)
    .set(set)
    .where(eq(usersTable.id, req.user.id))
    .returning();

  res.json({ user: userToPublic(updated) });
});

// ─── LEGACY redirect stubs (keep paths alive so old cookies don't 404) ─────
router.get('/login', (_req, res) => res.redirect(302, '/'));
router.get('/logout', (_req, res) => res.redirect(302, '/'));
router.get('/callback', (_req, res) => res.redirect(302, '/'));

export default router;
