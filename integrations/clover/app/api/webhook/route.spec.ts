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
                  objectId: "ORDER:order_valid_1",
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
              objectId: "ORDER:order_store_1",
              type: "CREATE",
              ts: 1700000002000,
            },
          ],
        },
      };

      await POST(makeRequest(body, { "x-clover-auth": WEBHOOK_AUTH_CODE }));

      const events = await db.select().from(dbSchema.cloverEvents);
      const inserted = events.find(
        (e) =>
          e.merchantId === "merchant_store" && e.eventId === "order_store_1",
      );

      assert.ok(inserted, "Expected event to be stored in the database");
      assert.equal(inserted.appId, APP_ID);
      assert.equal(inserted.changeType, "CREATE");
      assert.equal(inserted.eventType, "ORDER");
      assert.equal(inserted.eventTimestampMs, 1700000002000);
      assert.deepEqual(inserted.receivedAt, FIXED_TIME);
    });

    test("handles multiple merchants and events in a single payload", async () => {
      const body = {
        appId: APP_ID,
        merchants: {
          multi_merchant_1: [
            { objectId: "ORDER:m1_order_1", type: "CREATE", ts: 1700000003000 },
            { objectId: "ORDER:m1_order_2", type: "UPDATE", ts: 1700000003001 },
          ],
          multi_merchant_2: [
            { objectId: "ITEM:m2_item_1", type: "DELETE", ts: 1700000003002 },
          ],
        },
      };

      const response = await POST(
        makeRequest(body, { "x-clover-auth": WEBHOOK_AUTH_CODE }),
      );
      assert.equal(response.status, 200);

      const events = await db.select().from(dbSchema.cloverEvents);
      const batchEvents = events.filter((e) =>
        e.merchantId.startsWith("multi_merchant"),
      );
      assert.equal(batchEvents.length, 3);
    });

    test("is idempotent for duplicate payloads with the same idempotency key", async () => {
      const body = {
        appId: APP_ID,
        merchants: {
          merchant_idempotent: [
            {
              objectId: "ORDER:order_idempotent",
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

      const events = await db.select().from(dbSchema.cloverEvents);
      const deduplicated = events.filter(
        (e) =>
          e.merchantId === "merchant_idempotent" &&
          e.eventId === "order_idempotent",
      );
      assert.equal(
        deduplicated.length,
        1,
        "Expected exactly one record (no duplicate)",
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
