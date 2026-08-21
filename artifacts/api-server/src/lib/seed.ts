/**
 * Seed default accounts on startup. Idempotent — skipped if account exists.
 */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, usersTable } from '@workspace/db';
import { logger } from './logger';

const SEED_EMAIL = process.env.SEED_EMAIL ?? 'nadeem.mohammed@deffinity.com';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'CloserApp2026!';
const SEED_NAME = process.env.SEED_NAME ?? 'Nadeem';

export async function seedDefaultUsers() {
  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, SEED_EMAIL));

    if (existing) return; // already seeded

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
    await db.insert(usersTable).values({
      email: SEED_EMAIL,
      name: SEED_NAME,
      passwordHash,
    });

    logger.info({ email: SEED_EMAIL }, 'Seeded default user');
  } catch (err) {
    logger.error({ err }, 'Failed to seed default users');
  }
}
