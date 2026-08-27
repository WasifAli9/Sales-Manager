/**
 * Schedule follow-up sends for sequence emails that were delivered but not opened.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  emailSendsTable,
  emailSequenceStepsTable,
  emailSequencesTable,
  productsTable,
} from "@workspace/db/schema";
import { createUnsubscribeToken, appendUnsubscribeFooter, stripUnsubscribeFooter } from "./unsubscribe";
import { resolveSenderEmailConfig } from "./resolveSenderEmailConfig";
import { logger } from "./logger";

export async function scheduleResendForUnopened(): Promise<{ scheduled: number; skipped: number }> {
  const steps = await db
    .select({
      id: emailSequenceStepsTable.id,
      resendAfterHours: emailSequenceStepsTable.resendAfterHours,
    })
    .from(emailSequenceStepsTable)
    .where(eq(emailSequenceStepsTable.resendIfUnopened, true));

  if (!steps.length) return { scheduled: 0, skipped: 0 };

  const stepIds = steps.map(s => s.id);
  const afterHoursByStep = new Map(steps.map(s => [s.id, s.resendAfterHours ?? 48]));

  const candidates = await db
    .select({
      id: emailSendsTable.id,
      leadId: emailSendsTable.leadId,
      toAddress: emailSendsTable.toAddress,
      fromAddress: emailSendsTable.fromAddress,
      subject: emailSendsTable.subject,
      body: emailSendsTable.body,
      sequenceId: emailSendsTable.sequenceId,
      sequenceStepId: emailSendsTable.sequenceStepId,
      sentAt: emailSendsTable.sentAt,
      abVariant: emailSendsTable.abVariant,
    })
    .from(emailSendsTable)
    .where(and(
      inArray(emailSendsTable.sequenceStepId, stepIds),
      eq(emailSendsTable.status, "sent"),
      isNull(emailSendsTable.openedAt),
      isNull(emailSendsTable.resendOfSendId),
      sql`${emailSendsTable.sentAt} is not null`,
    ));

  let scheduled = 0;
  let skipped = 0;

  for (const send of candidates) {
    if (!send.sequenceStepId || !send.sentAt || !send.sequenceId) {
      skipped++;
      continue;
    }

    const afterHours = afterHoursByStep.get(send.sequenceStepId) ?? 48;
    const dueAt = new Date(send.sentAt.getTime() + afterHours * 3_600_000);
    if (dueAt > new Date()) {
      skipped++;
      continue;
    }

    const [existingResend] = await db
      .select({ id: emailSendsTable.id })
      .from(emailSendsTable)
      .where(eq(emailSendsTable.resendOfSendId, send.id))
      .limit(1);
    if (existingResend) {
      skipped++;
      continue;
    }

    const [sequence] = await db
      .select({ productId: emailSequencesTable.productId })
      .from(emailSequencesTable)
      .where(eq(emailSequencesTable.id, send.sequenceId))
      .limit(1);

    const product = sequence?.productId
      ? (await db.select().from(productsTable).where(eq(productsTable.id, sequence.productId)).limit(1))[0]
      : null;

    const senderConfig = await resolveSenderEmailConfig(sequence?.productId ?? null, null);
    const token = createUnsubscribeToken();
    const coreBody = stripUnsubscribeFooter(send.body);
    const followUpSubject = send.subject.trim().toLowerCase().startsWith("re:")
      ? send.subject
      : `Re: ${send.subject}`;

    const [inserted] = await db.insert(emailSendsTable).values({
      leadId: send.leadId,
      templateId: null,
      batchId: null,
      toAddress: send.toAddress,
      fromAddress: send.fromAddress,
      subject: followUpSubject,
      body: appendUnsubscribeFooter(coreBody, token, {
        productName: senderConfig.productName ?? product?.name,
        footerText: senderConfig.footerText ?? product?.unsubscribeFooterText,
        senderLabel: senderConfig.senderLabel ?? product?.unsubscribeSenderLabel,
        supportEmail: senderConfig.supportEmail ?? product?.unsubscribeSupportEmail,
      }),
      unsubscribeToken: token,
      status: "scheduled",
      scheduledFor: new Date(),
      sequenceId: send.sequenceId,
      sequenceStepId: send.sequenceStepId,
      abVariant: send.abVariant,
      resendOfSendId: send.id,
    }).returning({ id: emailSendsTable.id });

    if (inserted) scheduled++;
    else skipped++;
  }

  if (scheduled > 0) {
    logger.info({ scheduled, skipped }, "Scheduled follow-up resends for unopened emails");
  }

  return { scheduled, skipped };
}
