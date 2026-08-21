import cron from "node-cron";
import { logger } from "./logger";
import { sendPipelineDigest } from "./pipelineDigest";
import { sendScheduledEmails } from "../routes/emailSends";
import { postApprovedSocialPosts, autoGenerateMonthlySchedules } from "../routes/socialPosts";

/**
 * Start all scheduled jobs.
 * Called once from index.ts after the server starts listening.
 */
export function startScheduler(): void {
  // Daily pipeline digest at 7:00 AM server time
  cron.schedule("0 7 * * *", async () => {
    logger.info("Scheduler: running daily pipeline digest");
    try {
      const result = await sendPipelineDigest();
      logger.info(result, "Scheduler: pipeline digest complete");
    } catch (err) {
      logger.error({ err }, "Scheduler: pipeline digest failed");
    }
  });

  // Scheduled lead emails — check every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await sendScheduledEmails();
      if (result.sent > 0 || result.failed > 0) {
        logger.info(result, "Scheduler: scheduled emails processed");
      }
    } catch (err) {
      logger.error({ err }, "Scheduler: scheduled emails failed");
    }
  });

  // Social media auto-posting — daily at 09:00
  cron.schedule("0 9 * * *", async () => {
    logger.info("Scheduler: running social media auto-posting");
    try {
      const result = await postApprovedSocialPosts();
      if (result.posted > 0 || result.failed > 0) {
        logger.info(result, "Scheduler: social posts processed");
      }
    } catch (err) {
      logger.error({ err }, "Scheduler: social posting failed");
    }
  });

  // Monthly social schedule auto-generation — 08:00 on the 1st of each month
  // Generates next month's schedule for every product that has a website URL
  // and doesn't already have posts for that month (manual schedules are preserved).
  cron.schedule("0 8 1 * *", async () => {
    logger.info("Scheduler: auto-generating next month's social schedules");
    try {
      const result = await autoGenerateMonthlySchedules();
      logger.info(result, "Scheduler: monthly social schedule generation complete");
    } catch (err) {
      logger.error({ err }, "Scheduler: monthly social schedule generation failed");
    }
  });

  logger.info("Scheduler started — pipeline digest 07:00, lead emails every 15 min, social posts 09:00, monthly social gen 1st@08:00");
}
