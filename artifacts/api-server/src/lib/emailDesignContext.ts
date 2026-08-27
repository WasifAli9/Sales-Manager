/**
 * Load brand + design template context for sequence render / preview.
 */
import { db } from "@workspace/db";
import {
  emailBrandProfilesTable,
  emailDesignTemplatesTable,
  productAssetsTable,
  productsTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { appPublicUrl } from "./appUrl";
import {
  absoluteAssetUrl,
  defaultBrandColors,
  renderEmailDesign,
  type BrandRenderInput,
} from "./emailDesignRender";

export type SequenceDesignContext = {
  brand: BrandRenderInput;
  sequenceLogoUrl: string | null;
  brandLogoUrl: string | null;
  sequenceTemplateShell: string | null;
  stepTemplateShells: Map<number, string>;
};

async function logoUrlForAssetId(assetId: number | null | undefined): Promise<string | null> {
  if (!assetId) return null;
  const [asset] = await db
    .select({ storageUrl: productAssetsTable.storageUrl })
    .from(productAssetsTable)
    .where(eq(productAssetsTable.id, assetId))
    .limit(1);
  return absoluteAssetUrl(asset?.storageUrl, appPublicUrl());
}

export async function loadBrandForProduct(
  productId: number | null | undefined,
  brandNameFallback = "Product",
): Promise<BrandRenderInput> {
  const colors = defaultBrandColors();
  if (!productId) {
    return { ...colors, brandName: brandNameFallback, logoUrl: null };
  }

  const [product] = await db
    .select({ name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  const [profile] = await db
    .select()
    .from(emailBrandProfilesTable)
    .where(eq(emailBrandProfilesTable.productId, productId))
    .limit(1);

  const logoUrl = await logoUrlForAssetId(profile?.logoAssetId ?? null);

  return {
    brandName: product?.name ?? brandNameFallback,
    logoUrl,
    primaryColor: profile?.primaryColor ?? colors.primaryColor,
    secondaryColor: profile?.secondaryColor ?? colors.secondaryColor,
    accentColor: profile?.accentColor ?? colors.accentColor,
    backgroundColor: profile?.backgroundColor ?? colors.backgroundColor,
    textColor: profile?.textColor ?? colors.textColor,
    fontStack: profile?.fontStack ?? colors.fontStack,
  };
}

export async function loadSequenceDesignContext(opts: {
  productId: number | null;
  brandName?: string;
  sequenceLogoAssetId?: number | null;
  sequenceDesignTemplateId?: number | null;
  steps: Array<{ id: number; designTemplateId: number | null }>;
}): Promise<SequenceDesignContext> {
  const brand = await loadBrandForProduct(opts.productId, opts.brandName ?? "Product");
  const brandLogoUrl = brand.logoUrl;
  const sequenceLogoUrl = opts.sequenceLogoAssetId
    ? await logoUrlForAssetId(opts.sequenceLogoAssetId)
    : null;

  const effectiveBrand: BrandRenderInput = {
    ...brand,
    logoUrl: sequenceLogoUrl ?? brandLogoUrl,
  };

  let sequenceTemplateShell: string | null = null;
  if (opts.sequenceDesignTemplateId) {
    const [tpl] = await db
      .select({ htmlShell: emailDesignTemplatesTable.htmlShell, isActive: emailDesignTemplatesTable.isActive })
      .from(emailDesignTemplatesTable)
      .where(eq(emailDesignTemplatesTable.id, opts.sequenceDesignTemplateId))
      .limit(1);
    if (tpl?.isActive) sequenceTemplateShell = tpl.htmlShell;
  }

  const stepIds = [
    ...new Set(
      opts.steps
        .map((s) => s.designTemplateId)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];
  const stepTemplateShells = new Map<number, string>();
  if (stepIds.length) {
    const rows = await db
      .select({
        id: emailDesignTemplatesTable.id,
        htmlShell: emailDesignTemplatesTable.htmlShell,
        isActive: emailDesignTemplatesTable.isActive,
      })
      .from(emailDesignTemplatesTable)
      .where(inArray(emailDesignTemplatesTable.id, stepIds));
    for (const row of rows) {
      if (row.isActive) stepTemplateShells.set(row.id, row.htmlShell);
    }
  }

  return {
    brand: effectiveBrand,
    sequenceLogoUrl,
    brandLogoUrl,
    sequenceTemplateShell,
    stepTemplateShells,
  };
}

/** Resolve shell for a step: step override → sequence template → null. */
export function resolveStepShell(
  ctx: SequenceDesignContext,
  stepDesignTemplateId: number | null | undefined,
): string | null {
  if (stepDesignTemplateId && ctx.stepTemplateShells.has(stepDesignTemplateId)) {
    return ctx.stepTemplateShells.get(stepDesignTemplateId)!;
  }
  return ctx.sequenceTemplateShell;
}

export function renderSequenceStepBody(opts: {
  ctx: SequenceDesignContext;
  stepDesignTemplateId: number | null | undefined;
  bodyHtml: string;
  signatureHtml?: string | null;
}): string {
  const shell = resolveStepShell(opts.ctx, opts.stepDesignTemplateId);
  return renderEmailDesign({
    htmlShell: shell,
    bodyHtml: opts.bodyHtml,
    brand: { ...opts.ctx.brand, signatureHtml: opts.signatureHtml },
    injectLogoWhenNoTemplate: true,
  });
}
