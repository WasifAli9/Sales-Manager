import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Request } from "express";
import {
  db,
  emailSequencesTable,
  emailSendsTable,
  leadTagAssignmentsTable,
  leadTagsTable,
  leadsTable,
  pool,
  productAssignmentsTable,
  productsTable,
  usersTable,
} from "@workspace/db";
import { canAccessProduct } from "../lib/productAccess.ts";
import { resolveTagAudienceLeadIds } from "../lib/tagAudience.ts";

describe("product-scoped tag campaign launches", () => {
  const snapshotBatchIds: string[] = [];
  const sequenceIds: number[] = [];
  const leadIds: number[] = [];
  const tagIds: number[] = [];
  const productIds: number[] = [];
  let memberId: string | undefined;

  after(async () => {
    if (snapshotBatchIds.length) {
      await db.delete(emailSendsTable).where(inArray(emailSendsTable.batchId, snapshotBatchIds));
    }
    if (sequenceIds.length) {
      await db.delete(emailSequencesTable).where(inArray(emailSequencesTable.id, sequenceIds));
    }
    if (leadIds.length) {
      await db.delete(leadTagAssignmentsTable).where(inArray(leadTagAssignmentsTable.leadId, leadIds));
      await db.delete(leadsTable).where(inArray(leadsTable.id, leadIds));
    }
    if (tagIds.length) await db.delete(leadTagsTable).where(inArray(leadTagsTable.id, tagIds));
    if (productIds.length) await db.delete(productsTable).where(inArray(productsTable.id, productIds));
    if (memberId) await db.delete(usersTable).where(eq(usersTable.id, memberId));
    await pool.end();
  });

  it("keeps Any and All tag launches on the assigned sequence product", async () => {
    const suffix = randomUUID();
    memberId = `tag-campaign-member-${suffix}`;
    const memberEmail = `${suffix}@example.test`;

    await db.insert(usersTable).values({
      id: memberId,
      email: memberEmail,
      name: "Tag campaign test member",
      role: "member",
    });

    const products = await db.insert(productsTable).values([
      { name: `Tag campaign product A ${suffix}` },
      { name: `Tag campaign product B ${suffix}` },
    ]).returning({ id: productsTable.id });
    productIds.push(...products.map((product) => product.id));
    const [productAId, productBId] = productIds;

    await db.insert(productAssignmentsTable).values({
      productId: productAId,
      userId: memberId,
    });

    const tags = await db.insert(leadTagsTable).values([
      { name: `Shared campaign tag ${suffix}`, normalizedName: `shared-campaign-tag-${suffix}` },
      { name: `Second campaign tag ${suffix}`, normalizedName: `second-campaign-tag-${suffix}` },
    ]).returning({ id: leadTagsTable.id });
    tagIds.push(...tags.map((tag) => tag.id));
    const [sharedTagId, secondTagId] = tagIds;

    const leads = await db.insert(leadsTable).values([
      {
        productId: productAId,
        firstName: "A",
        lastName: "Both",
        email: `a-both-${suffix}@example.test`,
        assignedToUserId: memberId,
      },
      {
        productId: productAId,
        firstName: "A",
        lastName: "Any",
        email: `a-any-${suffix}@example.test`,
        assignedToUserId: memberId,
      },
      {
        productId: productAId,
        firstName: "A",
        lastName: "Unassigned",
        email: `a-unassigned-${suffix}@example.test`,
      },
      {
        productId: productBId,
        firstName: "B",
        lastName: "Both",
        email: `b-both-${suffix}@example.test`,
        assignedToUserId: memberId,
      },
    ]).returning({ id: leadsTable.id, email: leadsTable.email });
    leadIds.push(...leads.map((lead) => lead.id));
    const [aBothLeadId, aAnyLeadId, aUnassignedLeadId, bBothLeadId] = leadIds;
    const leadEmail = new Map(leads.map((lead) => [lead.id, lead.email!]));

    await db.insert(leadTagAssignmentsTable).values([
      { leadId: aBothLeadId, tagId: sharedTagId },
      { leadId: aBothLeadId, tagId: secondTagId },
      { leadId: aAnyLeadId, tagId: sharedTagId },
      { leadId: aUnassignedLeadId, tagId: sharedTagId },
      { leadId: aUnassignedLeadId, tagId: secondTagId },
      { leadId: bBothLeadId, tagId: sharedTagId },
      { leadId: bBothLeadId, tagId: secondTagId },
    ]);

    const [sequence] = await db.insert(emailSequencesTable).values({
      name: `Product A sequence ${suffix}`,
      productId: productAId,
    }).returning({ id: emailSequencesTable.id });
    sequenceIds.push(sequence.id);

    const memberRequest = {
      user: { id: memberId, email: memberEmail, name: "Tag campaign test member", role: "member" },
      isAuthenticated: () => true,
    } as unknown as Request;
    assert.equal(await canAccessProduct(memberRequest, productAId), true);
    assert.equal(await canAccessProduct(memberRequest, productBId), false);

    const anyLeadIds = await resolveTagAudienceLeadIds(
      memberRequest,
      [sharedTagId, secondTagId],
      "any",
      productAId,
    );
    const allLeadIds = await resolveTagAudienceLeadIds(
      memberRequest,
      [sharedTagId, secondTagId],
      "all",
      productAId,
    );
    assert.deepEqual(anyLeadIds.sort((a, b) => a - b), [aBothLeadId, aAnyLeadId].sort((a, b) => a - b));
    assert.deepEqual(allLeadIds, [aBothLeadId]);

    const snapshot = async (leadIdsToSnapshot: number[]) => {
      const batchId = randomUUID();
      snapshotBatchIds.push(batchId);
      await db.insert(emailSendsTable).values(leadIdsToSnapshot.map((leadId) => ({
        batchId,
        leadId,
        sequenceId: sequence.id,
        toAddress: leadEmail.get(leadId)!,
        subject: "Product A outreach",
        body: "Hello",
        status: "scheduled",
        scheduledFor: new Date(Date.now() + 60_000),
      })));
      return batchId;
    };
    const anyBatchId = await snapshot(anyLeadIds);
    const allBatchId = await snapshot(allLeadIds);

    const recipientIds = async (batchId: string) => {
      const sends = await db.select({ leadId: emailSendsTable.leadId })
        .from(emailSendsTable)
        .where(eq(emailSendsTable.batchId, batchId))
        .orderBy(asc(emailSendsTable.leadId));
      return sends.map((send) => send.leadId);
    };
    assert.deepEqual(await recipientIds(anyBatchId), [aBothLeadId, aAnyLeadId]);
    assert.deepEqual(await recipientIds(allBatchId), [aBothLeadId]);

    await db.delete(leadTagAssignmentsTable).where(and(
      eq(leadTagAssignmentsTable.leadId, aBothLeadId),
      eq(leadTagAssignmentsTable.tagId, secondTagId),
    ));
    await db.insert(leadTagAssignmentsTable).values({
      leadId: aAnyLeadId,
      tagId: secondTagId,
    });

    assert.deepEqual(await recipientIds(anyBatchId), [aBothLeadId, aAnyLeadId]);
    assert.deepEqual(await recipientIds(allBatchId), [aBothLeadId]);
    assert.equal((await recipientIds(anyBatchId)).includes(aUnassignedLeadId), false);
    assert.equal((await recipientIds(anyBatchId)).includes(bBothLeadId), false);
  });
});