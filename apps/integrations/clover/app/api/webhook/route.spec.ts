import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { Database, dbSchema } from "@forest-city-vault/infrastructure-database";
import { Effect } from "effect";

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

// `@/runtime` is imported *after* makeRouteTest has installed the `live.ts`
// mock, so `route` is bound to the transactional test AppLive (not production).
const { route } = await import("@/runtime");

const inbox = dbSchema.inboxes.payments.inbox;

function insertPaymentEvent(providerEventId: string) {
  return Effect.gen(function* () {
    const database = yield* Database;
    yield* database.query((sql) =>
      sql.insert(inbox).values([
        {
          requestId: "req-tx-test",
          status: "received",
          idempotencyKey: `tx:${providerEventId}`,
          provider: "clover",
          providerEventId,
          providerObjectId: providerEventId.split(":")[1] ?? providerEventId,
          eventType: "payment",
          payloadJson: JSON.stringify({ merchantId: "merchant-tx" }),
          occurredAt: new Date(1700000000000),
          receivedAt: FIXED_TIME,
        },
      ]),
    );
  });
}

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

  // Every webhook request runs inside one saga-scoped database transaction,
  // provided automatically by `AppLive` (the saga-scoped `Database`) and driven
  // by the `withSaga` wrapper in `defineRoute`. These tests exercise that
  // boundary through the real transactional `route` factory: a request that
  // fails after writing must leave nothing behind, while one that succeeds must
  // persist its writes — with no opt-in from the handler.
  describe("transactionality", () => {
    test("rolls back writes when the request fails after writing", async () => {
      const failingRoute = route(() =>
        Effect.gen(function* () {
          yield* insertPaymentEvent("P:tx_rollback_1");
          return yield* Effect.fail(new Error("boom after write"));
        }),
      );

      const response = await failingRoute(
        new NextRequest("http://localhost/api/webhooks/clover", {
          method: "POST",
        }),
      );
      assert.equal(response.status, 500);

      const rows = await db.select().from(inbox);
      const persisted = rows.find(
        (r) => r.providerEventId === "P:tx_rollback_1",
      );
      assert.equal(
        persisted,
        undefined,
        "the write before the failure should be rolled back",
      );
    });

    test("commits writes when the request succeeds", async () => {
      const succeedingRoute = route(() =>
        Effect.gen(function* () {
          yield* insertPaymentEvent("P:tx_commit_1");
          return true;
        }),
      );

      const response = await succeedingRoute(
        new NextRequest("http://localhost/api/webhooks/clover", {
          method: "POST",
        }),
      );
      assert.equal(response.status, 200);

      const rows = await db.select().from(inbox);
      const persisted = rows.find((r) => r.providerEventId === "P:tx_commit_1");
      assert.ok(persisted, "the write should be committed");
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
