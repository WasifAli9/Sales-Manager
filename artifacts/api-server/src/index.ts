import app, { setReady } from "./app";
import { logger } from "./lib/logger";
import { seedDefaultUsers } from "./lib/seed";
import { startScheduler } from "./lib/scheduler";
import { runMigrations } from "./lib/migrate";
import { backfillLeadStatuses } from "./lib/backfill";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production.");
}

// Bind to the port immediately so health-check probes (GET /api/healthz)
// return 200 right away. Migrations run in the background; non-health routes
// return 503 until the "ready" flag is flipped by setReady().
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening — running migrations in background");

  const finishStartup = () => {
    setReady(true);
    seedDefaultUsers().catch((e) => logger.error({ err: e }, "Seed failed"));
    backfillLeadStatuses().catch((e) => logger.error({ err: e }, "Backfill failed"));
    startScheduler();
  };

  // Schema is applied by docker/entrypoint.sh (`drizzle-kit push`) on Contabo.
  if (
    process.env.SKIP_SQL_MIGRATIONS === "true" ||
    (process.env.NODE_ENV === "production" && process.env.RUN_SQL_MIGRATIONS !== "true")
  ) {
    logger.info("Skipping SQL migrator — schema is applied with drizzle-kit push");
    finishStartup();
    return;
  }

  runMigrations()
    .then(() => {
      logger.info("Migrations applied — server ready");
      finishStartup();
    })
    .catch((err) => {
      logger.error({ err }, "Migrations failed — exiting so the container restarts automatically");
      // Exit with a non-zero code so Docker restarts the container.
      process.exit(1);
    });
});
