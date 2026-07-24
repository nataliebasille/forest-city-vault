import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { dbSchema } from "@forest-city-vault/infrastructure-database";

import { makeRouteTest } from "@/lib/testing/make-route-test";
import { NextRequest } from "next/server";

const {
  db,
  module: { POST },
  config: {
    clover: { appId: APP_ID, webhookAuthCode: WEBHOOK_AUTH_CODE },
  },
  time: FIXED_TIME,
} = await makeRouteTest<{ POST: (req: NextRequest) => Promise<Response> }>(
  import.meta.url,
  "./route",
);

describe("POST /api/webhooks/clover", () => {
  describe("verification", () => {
    test("returns 200 for a verification payload", async () => {
      const response = await POST(makeRequest({ verificationCode: "abc123" }));
      assert.equal(response.status, 200);
      assert.equal(await response.json(), true);
    });
  });

  describe("invalid body", () => {
    test("returns 400 for an empty body", async () => {
      const response = await POST(makeRequest({}));
      assert.equal(response.status, 400);
    });

    test("returns 400 for a body missing required event fields", async () => {
      const response = await POST(makeRequest({ appId: APP_ID }));
      assert.equal(response.status, 400);
    });
  });

  describe("authentication", () => {
    const validEventBody = {
      appId: APP_ID,
      merchants: {
        merchant_auth_test: [
          { objectId: "ORDER:order_auth_1", type: "CREATE", ts: 1700000000000 },
        ],
      },
    };

    test("returns 401 when auth header is missing", async () => {
      const response = await POST(makeRequest(validEventBody));
      assert.equal(response.status, 401);
    });

    test("returns 401 when auth header is incorrect", async () => {
      const response = await POST(
        makeRequest(validEventBody, { "x-clover-auth": "wrong-code" }),
      );
      assert.equal(response.status, 401);
    });
  });

  describe("event processing", () => {
    test("returns 200 for a valid event with correct auth", async () => {
      const response = await POST(
        makeRequest(
          {
            appId: APP_ID,
            merchants: {
              merchant_valid: [
                {
                  objectId: "P:order_valid_1",
                  type: "CREATE",
                  ts: 1700000001000,
                },
              ],
            },
          },
          { "x-clover-auth": WEBHOOK_AUTH_CODE },
        ),
      );
      assert.equal(response.status, 200);
      assert.equal(await response.json(), true);
    });

    test("stores webhook events in the database", async () => {
      const body = {
        appId: APP_ID,
        merchants: {
          merchant_store: [
            {
              objectId: "P:order_store_1",
              type: "CREATE",
              ts: 1700000002000,
            },
          ],
        },
      };

      await POST(makeRequest(body, { "x-clover-auth": WEBHOOK_AUTH_CODE }));

      const events = await db.select().from(dbSchema.inboxes.payments.inbox);
      const inserted = events.find(
        (e) => e.providerEventId === "P:order_store_1",
      );

      assert.ok(inserted, "Expected event to be stored in the database");
      assert.equal(inserted.eventType, "payment");
      assert.equal(inserted.occurredAt?.getTime(), 1700000002000);
      assert.deepEqual(inserted.receivedAt, FIXED_TIME);
    });

    test("handles multiple merchants and events in a single payload", async () => {
      const body = {
        appId: APP_ID,
        merchants: {
          multi_merchant_1: [
            { objectId: "P:m1_payment_1", type: "CREATE", ts: 1700000003000 },
            { objectId: "P:m1_payment_2", type: "UPDATE", ts: 1700000003001 },
          ],
          multi_merchant_2: [
            { objectId: "P:m2_payment_1", type: "DELETE", ts: 1700000003002 },
          ],
        },
      };

      const response = await POST(
        makeRequest(body, { "x-clover-auth": WEBHOOK_AUTH_CODE }),
      );
      assert.equal(response.status, 200);

      const events = await db.select().from(dbSchema.inboxes.payments.inbox);
      const inserted = events.filter((e) =>
        ["P:m1_payment_1", "P:m1_payment_2", "P:m2_payment_1"].includes(
          e.providerEventId,
        ),
      );
      assert.equal(inserted.length, 3);
    });

    test("is idempotent for duplicate payloads with the same idempotency key", async () => {
      const body = {
        appId: APP_ID,
        merchants: {
          merchant_idempotent: [
            {
              objectId: "P:order_idempotent",
              type: "CREATE",
              ts: 1700000004000,
            },
          ],
        },
      };
      const headers = { "x-clover-auth": WEBHOOK_AUTH_CODE };

      const response1 = await POST(makeRequest(body, headers));
      const response2 = await POST(makeRequest(body, headers));

      assert.equal(response1.status, 200);
      assert.equal(response2.status, 200);

      const events = await db.select().from(dbSchema.inboxes.payments.inbox);
      const deduplicated = events.filter(
        (e) => e.providerEventId === "P:order_idempotent",
      );
      assert.equal(
        deduplicated.length,
        1,
        "Expected exactly one record (no duplicate)",
      );
    });
  });

  // The webhook persists every payment event in a request through the saga-scoped
  // `route`, so the whole request is one transaction: either all of a payload's
  // events are committed, or none are. These tests drive the real POST handler to
  // prove that all-or-nothing boundary.
  describe("transactionality", () => {
    test("rolls back earlier events when a later event in the same request fails", async () => {
      // The second event's objectId has no ":" segment, so the handler derives an
      // undefined provider object id and the insert violates a NOT NULL
      // constraint — failing the request after the first event was written.
      const body = {
        appId: APP_ID,
        merchants: {
          merchant_rollback: [
            {
              objectId: "P:tx_rollback_good",
              type: "CREATE",
              ts: 1700000005000,
            },
            { objectId: "P", type: "CREATE", ts: 1700000005001 },
          ],
        },
      };

      const response = await POST(
        makeRequest(body, { "x-clover-auth": WEBHOOK_AUTH_CODE }),
      );
      assert.equal(response.status, 500);

      const events = await db.select().from(dbSchema.inboxes.payments.inbox);
      const persisted = events.find(
        (e) => e.providerEventId === "P:tx_rollback_good",
      );
      assert.equal(
        persisted,
        undefined,
        "the event written before the failure should be rolled back",
      );
    });

    test("commits every event in the payload when the whole request succeeds", async () => {
      const body = {
        appId: APP_ID,
        merchants: {
          merchant_commit: [
            { objectId: "P:tx_commit_1", type: "CREATE", ts: 1700000006000 },
            { objectId: "P:tx_commit_2", type: "UPDATE", ts: 1700000006001 },
          ],
        },
      };

      const response = await POST(
        makeRequest(body, { "x-clover-auth": WEBHOOK_AUTH_CODE }),
      );
      assert.equal(response.status, 200);

      const events = await db.select().from(dbSchema.inboxes.payments.inbox);
      const persisted = events.filter((e) =>
        ["P:tx_commit_1", "P:tx_commit_2"].includes(e.providerEventId),
      );
      assert.equal(
        persisted.length,
        2,
        "every event in a successful request should be committed together",
      );
    });
  });
});

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/webhooks/clover", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
