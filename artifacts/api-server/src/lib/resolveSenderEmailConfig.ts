import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, userProductEmailSettingsTable } from "@workspace/db/schema";
import { salesFromEmail } from "./email";

export type SenderEmailConfig = {
  from: string | undefined;
  signature: string | undefined;
  productName: string | undefined;
  footerText: string | undefined;
  senderLabel: string | undefined;
  supportEmail: string | undefined;
};

type ProductEmailRow = {
  fromEmail: string | null;
  fromName: string | null;
  emailSignature: string | null;
  name: string;
  unsubscribeFooterText: string | null;
  unsubscribeSenderLabel: string | null;
  unsubscribeSupportEmail: string | null;
};

type PersonalEmailRow = {
  fromEmail: string | null;
  fromName: string | null;
  emailSignature: string | null;
  unsubscribeFooterText: string | null;
  unsubscribeSenderLabel: string | null;
  unsubscribeSupportEmail: string | null;
};

function buildConfig(
  product: ProductEmailRow | null | undefined,
  personal: PersonalEmailRow | null | undefined,
): SenderEmailConfig {
  const fromEmail = personal?.fromEmail?.trim() || product?.fromEmail?.trim() || null;
  const fromName = personal?.fromName?.trim() || product?.fromName?.trim() || null;
  const signature = personal?.emailSignature ?? product?.emailSignature ?? null;
  const footerText = personal?.unsubscribeFooterText ?? product?.unsubscribeFooterText ?? null;
  const senderLabel = personal?.unsubscribeSenderLabel ?? product?.unsubscribeSenderLabel ?? null;
  const supportEmail = personal?.unsubscribeSupportEmail ?? product?.unsubscribeSupportEmail ?? null;

  const from = fromEmail
    ? `${fromName || fromEmail} <${fromEmail}>`
    : salesFromEmail();

  return {
    from,
    signature: signature ?? undefined,
    productName: product?.name,
    footerText: footerText ?? undefined,
    senderLabel: senderLabel ?? undefined,
    supportEmail: supportEmail ?? undefined,
  };
}

/** Load product defaults + optional personal overrides for a sender. */
export async function resolveSenderEmailConfig(
  productId: number | null | undefined,
  senderUserId?: string | null,
): Promise<SenderEmailConfig> {
  if (!productId) {
    return {
      from: salesFromEmail(),
      signature: undefined,
      productName: undefined,
      footerText: undefined,
      senderLabel: undefined,
      supportEmail: undefined,
    };
  }

  const [product] = await db
    .select({
      fromEmail: productsTable.fromEmail,
      fromName: productsTable.fromName,
      emailSignature: productsTable.emailSignature,
      name: productsTable.name,
      unsubscribeFooterText: productsTable.unsubscribeFooterText,
      unsubscribeSenderLabel: productsTable.unsubscribeSenderLabel,
      unsubscribeSupportEmail: productsTable.unsubscribeSupportEmail,
    })
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  let personal: PersonalEmailRow | undefined;
  if (senderUserId) {
    const [row] = await db
      .select({
        fromEmail: userProductEmailSettingsTable.fromEmail,
        fromName: userProductEmailSettingsTable.fromName,
        emailSignature: userProductEmailSettingsTable.emailSignature,
        unsubscribeFooterText: userProductEmailSettingsTable.unsubscribeFooterText,
        unsubscribeSenderLabel: userProductEmailSettingsTable.unsubscribeSenderLabel,
        unsubscribeSupportEmail: userProductEmailSettingsTable.unsubscribeSupportEmail,
      })
      .from(userProductEmailSettingsTable)
      .where(and(
        eq(userProductEmailSettingsTable.userId, senderUserId),
        eq(userProductEmailSettingsTable.productId, productId),
      ))
      .limit(1);
    personal = row;
  }

  return buildConfig(product, personal);
}
