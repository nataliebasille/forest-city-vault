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
  test("returns 200 for verification payloads without auth", async () => {
    const response = await POST(makeRequest({ verificationCode: "abc123" }));
    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);
  });

  test("returns 401 when auth header is missing on event payload", async () => {
    const response = await POST(
      makeRequest({
        appId: APP_ID,
        merchants: {
          merchant_1: [{ objectId: "O:order_1", type: "CREATE", ts: 1700000000000 }],
        },
      }),
    );

    assert.equal(response.status, 401);
  });

  test("stores order webhook events in the order inbox", async () => {
    const body = {
      appId: APP_ID,
      merchants: {
        merchant_store: [
          {
            objectId: "O:order_store_1",
            type: "CREATE",
            ts: 1700000002000,
          },
        ],
      },
    };

    const response = await POST(
      makeRequest(body, { "x-clover-auth": WEBHOOK_AUTH_CODE }),
    );
    assert.equal(response.status, 200);

    const events = await db.select().from(dbSchema.inboxes.orders.inbox);
    const inserted = events.find((e) => e.providerEventId === "O:order_store_1");

    assert.ok(inserted, "Expected event to be stored in the database");
    assert.equal(inserted.eventType, "upsert");
    assert.equal(inserted.occurredAt?.getTime(), 1700000002000);
    assert.deepEqual(inserted.receivedAt, FIXED_TIME);
  });

  test("is idempotent for duplicate payloads with the same idempotency key", async () => {
    const body = {
      appId: APP_ID,
      merchants: {
        merchant_idempotent: [
          {
            objectId: "O:order_idempotent",
            type: "CREATE",
            ts: 1700000004000,
          },
        ],
      },
    };
    const headers = { "x-clover-auth": WEBHOOK_AUTH_CODE };

    await POST(makeRequest(body, headers));
    await POST(makeRequest(body, headers));

    const events = await db.select().from(dbSchema.inboxes.orders.inbox);
    const deduplicated = events.filter(
      (e) => e.providerEventId === "O:order_idempotent",
    );
    assert.equal(deduplicated.length, 1);
  });

  test("rolls back earlier events when a later event in the same request fails", async () => {
    const body = {
      appId: APP_ID,
      merchants: {
        merchant_rollback: [
          {
            objectId: "O:tx_rollback_good",
            type: "CREATE",
            ts: 1700000005000,
          },
          { objectId: "O", type: "CREATE", ts: 1700000005001 },
        ],
      },
    };

    const response = await POST(
      makeRequest(body, { "x-clover-auth": WEBHOOK_AUTH_CODE }),
    );
    assert.equal(response.status, 500);

    const events = await db.select().from(dbSchema.inboxes.orders.inbox);
    const persisted = events.find((e) => e.providerEventId === "O:tx_rollback_good");
    assert.equal(persisted, undefined);
  });
});

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/webhooks/clover", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
