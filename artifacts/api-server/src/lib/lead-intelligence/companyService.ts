/**
 * Find-or-create company + enqueue research jobs for Lead Intelligence.
 */
import { and, eq, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  companiesTable,
  researchJobsTable,
  leadIntelligenceAuditTable,
  companyIntelligenceTable,
} from "@workspace/db/schema";
import {
  extractDomain,
  normalizeCompanyName,
  normalizeWebsite,
  parseEmployeeCount,
} from "./companyNormalize";

export type CompanySeed = {
  name: string;
  website?: string | null;
  industry?: string | null;
  employeeCount?: number | string | null;
  location?: string | null;
};

export async function findOrCreateCompany(productId: number, seed: CompanySeed) {
  const name = seed.name.trim() || "Unknown company";
  const normalizedName = normalizeCompanyName(name) || name.toLowerCase();
  const domain = extractDomain(seed.website);
  const website = normalizeWebsite(seed.website);
  const employeeCount = parseEmployeeCount(seed.employeeCount);

  if (domain) {
    const [byDomain] = await db
      .select()
      .from(companiesTable)
      .where(and(eq(companiesTable.productId, productId), eq(companiesTable.domain, domain)))
      .limit(1);
    if (byDomain) {
      await db
        .update(companiesTable)
        .set({
          name: byDomain.name || name,
          website: website ?? byDomain.website,
          industry: seed.industry ?? byDomain.industry,
          employeeCount: employeeCount ?? byDomain.employeeCount,
          location: seed.location ?? byDomain.location,
        })
        .where(eq(companiesTable.id, byDomain.id));
      return { company: byDomain, created: false };
    }
  }

  const nameConditions = [
    eq(companiesTable.productId, productId),
    eq(companiesTable.normalizedName, normalizedName),
  ];
  const [byName] = await db
    .select()
    .from(companiesTable)
    .where(and(...nameConditions))
    .limit(1);

  if (byName) {
    await db
      .update(companiesTable)
      .set({
        domain: domain ?? byName.domain,
        website: website ?? byName.website,
        industry: seed.industry ?? byName.industry,
        employeeCount: employeeCount ?? byName.employeeCount,
        location: seed.location ?? byName.location,
      })
      .where(eq(companiesTable.id, byName.id));
    return { company: byName, created: false };
  }

  const [created] = await db
    .insert(companiesTable)
    .values({
      productId,
      name,
      normalizedName,
      domain,
      website,
      industry: seed.industry ?? null,
      employeeCount,
      location: seed.location ?? null,
    })
    .returning();

  return { company: created, created: true };
}

export async function enqueueCompanyResearch(productId: number, companyId: number) {
  const [existing] = await db
    .select({ id: researchJobsTable.id })
    .from(researchJobsTable)
    .where(and(
      eq(researchJobsTable.productId, productId),
      eq(researchJobsTable.companyId, companyId),
      or(
        eq(researchJobsTable.status, "pending"),
        eq(researchJobsTable.status, "running"),
      ),
    ))
    .limit(1);

  if (existing) return existing;

  // Skip if researched within 30 days
  const [intel] = await db
    .select()
    .from(companyIntelligenceTable)
    .where(and(
      eq(companyIntelligenceTable.companyId, companyId),
      eq(companyIntelligenceTable.productId, productId),
    ))
    .limit(1);

  if (intel?.researchedAt) {
    const ageMs = Date.now() - new Date(intel.researchedAt).getTime();
    if (ageMs < 30 * 24 * 60 * 60 * 1000 && intel.researchStatus === "complete") {
      return null;
    }
  }

  const [job] = await db
    .insert(researchJobsTable)
    .values({ productId, companyId, status: "pending" })
    .returning();

  await db.insert(leadIntelligenceAuditTable).values({
    productId,
    companyId,
    eventType: "research_queued",
    payload: { jobId: job.id },
  });

  return job;
}

export async function writeAudit(event: {
  productId?: number | null;
  leadId?: number | null;
  companyId?: number | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await db.insert(leadIntelligenceAuditTable).values({
    productId: event.productId ?? null,
    leadId: event.leadId ?? null,
    companyId: event.companyId ?? null,
    eventType: event.eventType,
    payload: event.payload ?? null,
  });
}
