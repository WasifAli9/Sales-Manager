import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, emailSendsTable, leadsTable } from "@workspace/db";

const router: IRouter = Router();

function confirmationPage(message: string, status = 200): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head>
<body style="margin:0;background:#0b1220;color:#f2f5fa;font-family:system-ui,-apple-system,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px">
  <main style="max-width:480px;border:1px solid #2a3550;border-radius:18px;background:#131c2e;padding:32px;text-align:center">
    <p style="margin:0 0 12px;color:#4dd4c1;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Sales Manager</p>
    <h1 style="margin:0 0 12px;font-size:24px">Email preferences updated</h1>
    <p style="margin:0;color:#b5c0d8;line-height:1.6">${message}</p>
  </main>
</body></html>`;
}

export async function unsubscribeLeadByToken(
  token: string,
): Promise<"unsubscribed" | "already" | "invalid"> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return "invalid";

  return db.transaction(async (tx) => {
    const [send] = await tx
      .select({ leadId: emailSendsTable.leadId })
      .from(emailSendsTable)
      .where(eq(emailSendsTable.unsubscribeToken, token))
      .limit(1);
    if (!send?.leadId) return "invalid";

    const [updated] = await tx
      .update(leadsTable)
      .set({
        unsubscribedAt: new Date(),
        unsubscribeSource: "email_unsubscribe_link",
      })
      .where(
        and(eq(leadsTable.id, send.leadId), isNull(leadsTable.unsubscribedAt)),
      )
      .returning({ id: leadsTable.id });

    await tx
      .update(emailSendsTable)
      .set({ status: "cancelled", errorMessage: "Recipient unsubscribed" })
      // A pending row has already been claimed for provider submission. Only
      // cancel future scheduled work so delivery status remains truthful.
      .where(
        and(
          eq(emailSendsTable.leadId, send.leadId),
          eq(emailSendsTable.status, "scheduled"),
        ),
      );

    return updated ? "unsubscribed" : "already";
  });
}

router.get(
  "/unsubscribe/:token",
  async (req: Request, res: Response): Promise<void> => {
    const result = await unsubscribeLeadByToken(String(req.params.token));
    if (result === "invalid") {
      res
        .status(404)
        .type("html")
        .send(
          confirmationPage(
            "This unsubscribe link is invalid or has expired.",
            404,
          ),
        );
      return;
    }
    const message =
      result === "unsubscribed"
        ? "You will no longer receive future outreach emails from this workspace."
        : "You are already unsubscribed from future outreach emails.";
    res.type("html").send(confirmationPage(message));
  },
);

router.post(
  "/unsubscribe/:token",
  async (req: Request, res: Response): Promise<void> => {
    const result = await unsubscribeLeadByToken(String(req.params.token));
    res.status(result === "invalid" ? 404 : 200).end();
  },
);

export default router;