import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import type { Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  contactListMembersTable,
  contactListsTable,
  db,
  emailCampaignsTable,
  emailSequenceStepsTable,
  emailSequencesTable,
  emailSendsTable,
  leadsTable,
  productAssignmentsTable,
  productsTable,
  usersTable,
  pool,
} from "@workspace/db";
import emailSendsRouter from "./emailSends.ts";
import emailSequencesRouter from "./emailSequences.ts";
import { unsubscribeLeadByToken } from "./unsubscribe.ts";

type RouteHandler = (req: Request, res: Response) => Promise<void>;

type TestResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => TestResponse;
  json: (body: unknown) => TestResponse;
  type: () => TestResponse;
  send: (body: unknown) => TestResponse;
  end: () => TestResponse;
};

function routeHandler(
  router: unknown,
  method: "get" | "post",
  path: string,
): RouteHandler {
  const stack =
    (
      router as {
        stack?: Array<{
          route?: {
            path?: string;
            stack?: Array<{ method?: string; handle?: RouteHandler }>;
          };
        }>;
      }
    ).stack ?? [];
  const route = stack.find((layer) => layer.route?.path === path)?.route;
  const handler = route?.stack?.find(
    (layer) => layer.method === method,
  )?.handle;
  if (!handler)
    throw new Error(`Could not find ${method.toUpperCase()} ${path}`);
  return handler;
}

function response(): TestResponse {
  const result: TestResponse = {
    statusCode: 200,
    body: undefined,
    status(code) {
      result.statusCode = code;
      return result;
    },
    json(body) {
      result.body = body;
      return result;
    },
    type() {
      return result;
    },
    send(body) {
      result.body = body;
      return result;
    },
    end() {
      return result;
    },
  };
  return result;
}

function request(options: {
  user: { id: string; email: string; name: string; role: "owner" | "member" };
  body?: unknown;
  params?: Record<string, string>;
}): Request {
  return {
    user: options.user,
    body: options.body ?? {},
    params: options.params ?? {},
    isAuthenticated: () => true,
    log: { error() {}, warn() {} },
  } as unknown as Request;
}

const bulkSchedule = routeHandler(
  emailSendsRouter,
  "post",
  "/leads/bulk-schedule-email",
);
const sendNow = routeHandler(emailSendsRouter, "post", "/leads/:id/send-email");
const enroll = routeHandler(
  emailSequencesRouter,
  "post",
  "/email-sequences/:id/enroll",
);
const launch = routeHandler(
  emailSequencesRouter,
  "post",
  "/email-sequences/:id/launch",
);

describe("outreach authorization and unsubscribe safety", () => {
  const suffix = randomUUID();
  const leadIds: number[] = [];
  const productIds: number[] = [];
  const sequenceIds: number[] = [];
  const listIds: number[] = [];
  const userIds: string[] = [];

  after(async () => {
    if (leadIds.length) {
      await db
        .delete(emailSendsTable)
        .where(inArray(emailSendsTable.leadId, leadIds));
    }
    if (userIds.length) {
      await db
        .delete(emailCampaignsTable)
        .where(inArray(emailCampaignsTable.createdByUserId, userIds));
    }
    if (listIds.length) {
      await db
        .delete(contactListMembersTable)
        .where(inArray(contactListMembersTable.listId, listIds));
      await db
        .delete(contactListsTable)
        .where(inArray(contactListsTable.id, listIds));
    }
    if (sequenceIds.length) {
      await db
        .delete(emailSequencesTable)
        .where(inArray(emailSequencesTable.id, sequenceIds));
    }
    if (leadIds.length)
      await db.delete(leadsTable).where(inArray(leadsTable.id, leadIds));
    if (userIds.length)
      await db
        .delete(productAssignmentsTable)
        .where(inArray(productAssignmentsTable.userId, userIds));
    if (productIds.length)
      await db
        .delete(productsTable)
        .where(inArray(productsTable.id, productIds));
    if (userIds.length)
      await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    await pool.end();
  });

  it("blocks unauthorized bulk scheduling, suppresses opted-out recipients in every path, and preserves claimed delivery status", async () => {
    // Test-only URLs keep footer creation deterministic; no path below sends email.
    process.env.PUBLIC_APP_URL ??= "https://outreach-safety.example.test";

    const member = {
      id: `outreach-safety-member-${suffix}`,
      email: `member-${suffix}@example.test`,
      name: "Outreach safety member",
      role: "member" as const,
    };
    const teammate = {
      id: `outreach-safety-teammate-${suffix}`,
      email: `teammate-${suffix}@example.test`,
      name: "Outreach safety teammate",
      role: "member" as const,
    };
    const owner = {
      id: `outreach-safety-owner-${suffix}`,
      email: `owner-${suffix}@example.test`,
      name: "Outreach safety owner",
      role: "owner" as const,
    };
    userIds.push(member.id, teammate.id, owner.id);
    await db.insert(usersTable).values([member, teammate, owner]);

    const products = await db
      .insert(productsTable)
      .values([
        { name: `Accessible product ${suffix}` },
        { name: `Restricted product ${suffix}` },
      ])
      .returning({ id: productsTable.id });
    productIds.push(...products.map((product) => product.id));
    const [accessibleProductId, restrictedProductId] = productIds;
    await db.insert(productAssignmentsTable).values({
      productId: accessibleProductId,
      userId: member.id,
    });

    const leads = await db
      .insert(leadsTable)
      .values([
        {
          firstName: "Owned",
          email: `owned-${suffix}@example.test`,
          productId: accessibleProductId,
          assignedToUserId: member.id,
        },
        {
          firstName: "Teammate",
          email: `teammate-lead-${suffix}@example.test`,
          productId: accessibleProductId,
          assignedToUserId: teammate.id,
        },
        {
          firstName: "Restricted",
          email: `restricted-${suffix}@example.test`,
          productId: restrictedProductId,
          assignedToUserId: member.id,
        },
        {
          firstName: "Immediate opt-out",
          email: `immediate-opt-out-${suffix}@example.test`,
          unsubscribedAt: new Date(),
        },
        {
          firstName: "Bulk active",
          email: `bulk-active-${suffix}@example.test`,
        },
        {
          firstName: "Bulk opt-out",
          email: `bulk-opt-out-${suffix}@example.test`,
          unsubscribedAt: new Date(),
        },
        {
          firstName: "Sequence active",
          email: `sequence-active-${suffix}@example.test`,
        },
        {
          firstName: "Sequence opt-out",
          email: `sequence-opt-out-${suffix}@example.test`,
          unsubscribedAt: new Date(),
        },
        {
          firstName: "Campaign active",
          email: `campaign-active-${suffix}@example.test`,
        },
        {
          firstName: "Campaign opt-out",
          email: `campaign-opt-out-${suffix}@example.test`,
          unsubscribedAt: new Date(),
        },
        {
          firstName: "Unsubscribe timing",
          email: `unsubscribe-timing-${suffix}@example.test`,
        },
      ])
      .returning({ id: leadsTable.id });
    leadIds.push(...leads.map((lead) => lead.id));
    const [
      ownedLeadId,
      teammateLeadId,
      restrictedLeadId,
      immediateOptOutLeadId,
      bulkActiveLeadId,
      bulkOptOutLeadId,
      sequenceActiveLeadId,
      sequenceOptOutLeadId,
      campaignActiveLeadId,
      campaignOptOutLeadId,
      unsubscribeTimingLeadId,
    ] = leadIds;
    const future = new Date(Date.now() + 15 * 60_000).toISOString();

    for (const leadIdsToReject of [
      [ownedLeadId, teammateLeadId],
      [ownedLeadId, restrictedLeadId],
    ]) {
      const res = response();
      await bulkSchedule(
        request({
          user: member,
          body: {
            leadIds: leadIdsToReject,
            subject: "Safety check",
            body: "Hello",
            scheduledFor: future,
          },
        }),
        res as unknown as Response,
      );
      assert.equal(res.statusCode, 403);
    }
    const forbiddenRows = await db
      .select({ id: emailSendsTable.id })
      .from(emailSendsTable)
      .where(
        inArray(emailSendsTable.leadId, [
          ownedLeadId,
          teammateLeadId,
          restrictedLeadId,
        ]),
      );
    assert.equal(forbiddenRows.length, 0);

    const immediateResponse = response();
    await sendNow(
      request({
        user: owner,
        params: { id: String(immediateOptOutLeadId) },
        body: {
          subject: "Should not send",
          body: "Opted-out recipients must be skipped.",
        },
      }),
      immediateResponse as unknown as Response,
    );
    assert.deepEqual(immediateResponse.body, {
      skipped: true,
      skipReason: "unsubscribed",
    });
    const immediateRows = await db
      .select({ id: emailSendsTable.id })
      .from(emailSendsTable)
      .where(eq(emailSendsTable.leadId, immediateOptOutLeadId));
    assert.equal(immediateRows.length, 0);

    const bulkResponse = response();
    await bulkSchedule(
      request({
        user: owner,
        body: {
          leadIds: [bulkActiveLeadId, bulkOptOutLeadId],
          subject: "Bulk safety check",
          body: "Hello",
          scheduledFor: future,
        },
      }),
      bulkResponse as unknown as Response,
    );
    assert.deepEqual(
      bulkResponse.body && {
        scheduled: (bulkResponse.body as { scheduled: number }).scheduled,
        unsubscribed: (bulkResponse.body as { unsubscribed: number })
          .unsubscribed,
      },
      { scheduled: 1, unsubscribed: 1 },
    );
    const bulkRows = await db
      .select({ leadId: emailSendsTable.leadId })
      .from(emailSendsTable)
      .where(
        inArray(emailSendsTable.leadId, [bulkActiveLeadId, bulkOptOutLeadId]),
      );
    assert.deepEqual(
      bulkRows.map((row) => row.leadId),
      [bulkActiveLeadId],
    );

    const [sequence] = await db
      .insert(emailSequencesTable)
      .values({
        name: `Safety sequence ${suffix}`,
      })
      .returning({ id: emailSequencesTable.id });
    sequenceIds.push(sequence.id);
    await db.insert(emailSequenceStepsTable).values([
      {
        sequenceId: sequence.id,
        position: 1,
        delayDays: 0,
        subject: "First step",
        body: "Hello",
      },
      {
        sequenceId: sequence.id,
        position: 2,
        delayDays: 1,
        subject: "Second step",
        body: "Hello again",
      },
    ]);

    const enrollResponse = response();
    await enroll(
      request({
        user: owner,
        params: { id: String(sequence.id) },
        body: {
          leadIds: [sequenceActiveLeadId, sequenceOptOutLeadId],
          enrollDate: future,
        },
      }),
      enrollResponse as unknown as Response,
    );
    assert.deepEqual(
      enrollResponse.body && {
        enrolled: (enrollResponse.body as { enrolled: number }).enrolled,
        scheduled: (enrollResponse.body as { scheduled: number }).scheduled,
        unsubscribedSkipped: (
          enrollResponse.body as { unsubscribedSkipped: number }
        ).unsubscribedSkipped,
      },
      { enrolled: 1, scheduled: 2, unsubscribedSkipped: 1 },
    );
    const sequenceRows = await db
      .select({ leadId: emailSendsTable.leadId })
      .from(emailSendsTable)
      .where(eq(emailSendsTable.sequenceId, sequence.id));
    assert.deepEqual(
      sequenceRows.map((row) => row.leadId),
      [sequenceActiveLeadId, sequenceActiveLeadId],
    );

    const [list] = await db
      .insert(contactListsTable)
      .values({
        name: `Safety campaign list ${suffix}`,
        createdByUserId: owner.id,
      })
      .returning({ id: contactListsTable.id });
    listIds.push(list.id);
    await db.insert(contactListMembersTable).values([
      { listId: list.id, leadId: campaignActiveLeadId },
      { listId: list.id, leadId: campaignOptOutLeadId },
    ]);
    const launchResponse = response();
    await launch(
      request({
        user: owner,
        params: { id: String(sequence.id) },
        body: {
          name: `Safety campaign ${suffix}`,
          contactListId: list.id,
          startAt: future,
        },
      }),
      launchResponse as unknown as Response,
    );
    assert.equal(launchResponse.statusCode, 201);
    assert.deepEqual(
      launchResponse.body && {
        enrolled: (launchResponse.body as { enrolled: number }).enrolled,
        scheduled: (launchResponse.body as { scheduled: number }).scheduled,
        unsubscribedSkipped: (
          launchResponse.body as { unsubscribedSkipped: number }
        ).unsubscribedSkipped,
      },
      { enrolled: 1, scheduled: 2, unsubscribedSkipped: 1 },
    );
    const [campaign] = await db
      .select({ batchId: emailCampaignsTable.batchId })
      .from(emailCampaignsTable)
      .where(eq(emailCampaignsTable.contactListId, list.id));
    const campaignRows = await db
      .select({ leadId: emailSendsTable.leadId })
      .from(emailSendsTable)
      .where(eq(emailSendsTable.batchId, campaign.batchId));
    assert.deepEqual(
      campaignRows.map((row) => row.leadId),
      [campaignActiveLeadId, campaignActiveLeadId],
    );

    const unsubscribeToken = randomUUID();
    await db.insert(emailSendsTable).values([
      {
        leadId: unsubscribeTimingLeadId,
        toAddress: `unsubscribe-timing-${suffix}@example.test`,
        subject: "Scheduled delivery",
        body: "Hello",
        status: "scheduled",
        scheduledFor: new Date(Date.now() + 60_000),
        unsubscribeToken,
      },
      {
        leadId: unsubscribeTimingLeadId,
        toAddress: `unsubscribe-timing-${suffix}@example.test`,
        subject: "Another scheduled delivery",
        body: "Hello",
        status: "scheduled",
        scheduledFor: new Date(Date.now() + 120_000),
        unsubscribeToken: randomUUID(),
      },
      {
        leadId: unsubscribeTimingLeadId,
        toAddress: `unsubscribe-timing-${suffix}@example.test`,
        subject: "Already claimed delivery",
        body: "Hello",
        status: "pending",
        unsubscribeToken: randomUUID(),
      },
    ]);
    assert.equal(
      await unsubscribeLeadByToken(unsubscribeToken),
      "unsubscribed",
    );
    const [unsubscribedLead] = await db
      .select({ unsubscribedAt: leadsTable.unsubscribedAt })
      .from(leadsTable)
      .where(eq(leadsTable.id, unsubscribeTimingLeadId));
    assert.ok(unsubscribedLead.unsubscribedAt);
    const timingRows = await db
      .select({
        subject: emailSendsTable.subject,
        status: emailSendsTable.status,
        errorMessage: emailSendsTable.errorMessage,
      })
      .from(emailSendsTable)
      .where(eq(emailSendsTable.leadId, unsubscribeTimingLeadId));
    assert.deepEqual(
      Object.fromEntries(
        timingRows.map((row) => [
          row.subject,
          {
            status: row.status,
            errorMessage: row.errorMessage,
          },
        ]),
      ),
      {
        "Scheduled delivery": {
          status: "cancelled",
          errorMessage: "Recipient unsubscribed",
        },
        "Another scheduled delivery": {
          status: "cancelled",
          errorMessage: "Recipient unsubscribed",
        },
        "Already claimed delivery": { status: "pending", errorMessage: null },
      },
    );
  });
});