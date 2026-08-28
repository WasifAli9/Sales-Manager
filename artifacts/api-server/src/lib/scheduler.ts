import cron from "node-cron";
import { logger } from "./logger";
import { sendPipelineDigest } from "./pipelineDigest";
import { sendScheduledEmails } from "../routes/emailSends";
import { scheduleResendForUnopened } from "./resendUnopenedEmails";
import { postApprovedSocialPosts, autoGenerateMonthlySchedules } from "../routes/socialPosts";
import { processResearchJobs } from "./lead-intelligence/researchProcessor";
import { processDueFollowUps } from "./reply-agent/processor";
import { refreshAllActiveDeals } from "./opportunity-agent/service";
import { rebuildPlansForAllActiveUsers } from "./founder-planner/service";

/**
 * Start all scheduled jobs.
 * Called once from index.ts after the server starts listening.
 */
export function startScheduler(): void {
  // Morning Founder Daily Planner rebuild (~06:30)
  cron.schedule("30 6 * * *", async () => {
    logger.info("Scheduler: rebuilding founder daily plans");
    try {
      const result = await rebuildPlansForAllActiveUsers();
      logger.info(result, "Scheduler: founder daily plans rebuilt");
    } catch (err) {
      logger.error({ err }, "Scheduler: founder daily plan rebuild failed");
    }
  });

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
      const resendResult = await scheduleResendForUnopened();
      if (resendResult.scheduled > 0) {
        logger.info(resendResult, "Scheduler: unopened follow-ups scheduled");
      }
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

  // Lead Intelligence research queue — every 3 minutes
  cron.schedule("*/3 * * * *", async () => {
    try {
      const result = await processResearchJobs(5);
      if (result.processed > 0 || result.failed > 0) {
        logger.info(result, "Scheduler: lead research jobs processed");
      }
    } catch (err) {
      logger.error({ err }, "Scheduler: lead research failed");
    }
  });

  // Reply Agent due follow-ups — every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await processDueFollowUps();
      if (result.due > 0) {
        logger.info(result, "Scheduler: reply follow-ups marked due");
      }
    } catch (err) {
      logger.error({ err }, "Scheduler: reply follow-ups failed");
    }
  });

  // Opportunity health / stall refresh — every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    try {
      const result = await refreshAllActiveDeals(80);
      if (result.refreshed > 0) {
        logger.info(result, "Scheduler: opportunity engines refreshed");
      }
    } catch (err) {
      logger.error({ err }, "Scheduler: opportunity refresh failed");
    }
  });

  logger.info("Scheduler started — morning My Day 06:30, pipeline digest 07:00, lead emails every 15 min, social posts 09:00, monthly social gen 1st@08:00, lead research every 3 min, reply follow-ups every 15 min, opportunity refresh every 30 min");
}
