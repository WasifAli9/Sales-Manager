import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { logger } from "./logger";

// In the bundled dist output, import.meta.url resolves to:
//   /home/runner/workspace/artifacts/api-server/dist/index.mjs
// Going up 3 directories from dist/ reaches the workspace root,
// then we descend into lib/db/drizzle.
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../lib/db/drizzle",
);

export async function runMigrations(): Promise<void> {
  logger.info({ migrationsDir: MIGRATIONS_DIR }, "Running database migrations");
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    logger.info("Database migrations applied successfully");
  } catch (err) {
    logger.error({ err }, "Database migration failed");
    throw err;
  }
}
