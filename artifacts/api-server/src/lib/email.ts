import { Resend } from "resend";
import { logger } from "./logger";
import { appPublicUrl } from "./appUrl";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

/** System mail: invites, password reset, coach verdict. */
export function systemFromEmail(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    "Sales Manager <noreply@creativecloud.ai>"
  );
}

/** Sales / outreach mail: leads, digests, targets, social notify. */
export function salesFromEmail(): string {
  return (
    process.env.RESEND_FROM_SALES?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "Sales Manager <salesmanager@creativecloud.ai>"
  );
}

function formatResendError(error: unknown): string {
  if (!error) return "Unknown Resend error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as { message?: unknown; name?: unknown; statusCode?: unknown };
    const parts = [
      e.name ? String(e.name) : null,
      e.message ? String(e.message) : null,
      e.statusCode != null ? `(${e.statusCode})` : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(": ");
  }
  return String(error);
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64-encoded
  type: string;    // MIME type
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  /** Override the default FROM address. Must be on a Resend-verified domain. */
  from?: string;
  /** Standards-compliant message headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Send a transactional email via Resend.
 * Callers that only need the message id can use `ok ? result.id : null`.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const resend = getResend();
  if (!resend) {
    const error = "RESEND_API_KEY is not set — email was not sent";
    logger.warn(error);
    return { ok: false, error };
  }
  const from = opts.from ?? systemFromEmail();
  try {
    const { data, error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
      ...(opts.attachments?.length
        ? {
            attachments: opts.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, "base64"),
            })),
          }
        : {}),
    });

    if (error) {
      const message = formatResendError(error);
      logger.warn({ error, from, to: opts.to, subject: opts.subject }, "Resend email failed");
      return { ok: false, error: message };
    }

    const id = data?.id;
    if (!id) {
      const message = "Resend accepted the request but returned no message id";
      logger.warn({ from, to: opts.to, subject: opts.subject }, message);
      return { ok: false, error: message };
    }

    logger.info({ to: opts.to, subject: opts.subject, id, from }, "Email sent via Resend");
    return { ok: true, id };
  } catch (err) {
    const message = formatResendError(err);
    logger.error({ err, from, to: opts.to, subject: opts.subject }, "Resend email threw");
    return { ok: false, error: message };
  }
}

/** Interpolate {{variable}} placeholders in a template string.
 *  Matching is case-insensitive so {{firstname}} and {{firstName}} both work. */
export function interpolate(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  // Build a lowercase-keyed copy so we can match case-insensitively
  const lcVars: Record<string, string | null | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    lcVars[k.toLowerCase()] = v;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => lcVars[key.toLowerCase()] ?? "");
}

/** Coach morning push email */
export function coachPushEmail(coachPush: string, date: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #0B1220; color: #F2F5FA; padding: 32px; max-width: 480px; margin: 0 auto;">
  <div style="background: #131C2E; border: 1px solid #2A3550; border-radius: 16px; padding: 28px;">
    <p style="color: #4DD4C1; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 12px;">SALES MANAGER · ${date}</p>
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px; line-height: 1.3;">Good morning. Here's your push.</h1>
    <blockquote style="border-left: 3px solid #4DD4C1; margin: 0 0 20px; padding: 12px 16px; color: #9AA6BF; font-size: 15px; line-height: 1.6;">
      "${coachPush}"
    </blockquote>
    <a href="${appPublicUrl()}" style="display: inline-block; background: #4DD4C1; color: #0B1220; padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 14px; text-decoration: none;">Open Sales Manager</a>
  </div>
</body>
</html>`;
}

/** Evening reflection reminder email */
export function reflectionReminderEmail(date: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #0B1220; color: #F2F5FA; padding: 32px; max-width: 480px; margin: 0 auto;">
  <div style="background: #131C2E; border: 1px solid #2A3550; border-radius: 16px; padding: 28px;">
    <p style="color: #9AA6BF; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 12px;">SALES MANAGER · END OF DAY · ${date}</p>
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 12px;">Time for your verdict.</h1>
    <p style="color: #9AA6BF; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">What moved the needle today? What did you let slide? The coach is waiting — 90 seconds, honest answers, no sugar-coating.</p>
    <a href="${appPublicUrl()}" style="display: inline-block; background: #131C2E; color: #4DD4C1; padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 14px; text-decoration: none; border: 1px solid #4DD4C1;">Write today's reflection</a>
  </div>
</body>
</html>`;
}
