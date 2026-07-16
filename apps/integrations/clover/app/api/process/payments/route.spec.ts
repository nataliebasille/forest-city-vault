import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import { dbSchema } from "@forest-city-vault/infrastructure-database";
import { Effect } from "effect";
import { NextRequest } from "next/server";

import { encryptToken } from "@/lib/integration/token-crypto";
import { makeRouteTest } from "@/lib/testing/make-route-test";

const ENCRYPTION_KEY = "test-token-encryption-key";

const {
  db,
  module: { POST },
} = await makeRouteTest<{ POST: (req: NextRequest) => Promise<Response> }>(
  import.meta.url,
  "./route",
  { tokenEncryptionKey: ENCRYPTION_KEY },
);

describe("POST /api/process/payments", () => {
  test("processes a payment when the merchant has a valid token", async () => {
    await seedMerchantToken("merchant-ok", "valid-access-token");
    await insertInboxMessage("merchant-ok", "payment-ok", "P:payment-ok");
    stubCloverPayment("payment-ok");

    const response = await POST(processRequest());

    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);

    // The saga marks the message processed only after the sale is durably saved.
    const inboxRows = await db
      .select()
      .from(dbSchema.inboxes.payments.inbox);
    const message = inboxRows.find((r) => r.providerObjectId === "payment-ok");
    assert.ok(message, "expected the inbox message to exist");
    assert.equal(message.status, "processed");

    const sales = await db.select().from(dbSchema.sales);
    assert.equal(sales.length, 1, "expected one sale to be created");
  });

  test("records a terminal failure when the merchant is not connected", async () => {
    await insertInboxMessage(
      "merchant-missing",
      "payment-missing",
      "P:payment-missing",
    );

    const response = await POST(processRequest());
    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);

    const inboxRows = await db
      .select()
      .from(dbSchema.inboxes.payments.inbox);
    const message = inboxRows.find(
      (r) => r.providerObjectId === "payment-missing",
    );
    assert.ok(message, "expected the inbox message to exist");
    // No token row for the merchant → MerchantNotConnectedError → failed attempt.
    assert.equal(message.status, "failed");
    assert.ok(message.attempts >= 1, "message should have been attempted");
  });

  test("payment inbox route returns 200 with an empty inbox", async () => {
    const response = await POST(processRequest());
    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);
  });
});

function processRequest() {
  return new NextRequest("http://localhost/api/process/payments", {
    method: "POST",
  });
}

async function seedMerchantToken(merchantId: string, accessTokenPlain: string) {
  const accessToken = await Effect.runPromise(
    encryptToken(ENCRYPTION_KEY, accessTokenPlain),
  );

  await db.insert(dbSchema.cloverMerchantTokens).values([
    {
      merchantId,
      appId: "test-app-id",
      accessToken,
      // A null expiry means a non-expiring token, so no refresh is attempted.
      accessTokenExpiresAt: null,
      refreshToken: null,
      refreshTokenExpiresAt: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
  ]);
}

async function insertInboxMessage(
  merchantId: string,
  paymentId: string,
  providerEventId: string,
) {
  await db.insert(dbSchema.inboxes.payments.inbox).values([
    {
      requestId: `req-${paymentId}`,
      status: "received",
      idempotencyKey: `app-1:${merchantId}:P:${paymentId}:CREATE:1700000000000`,
      provider: "clover",
      providerEventId,
      providerObjectId: paymentId,
      eventType: "payment",
      payloadJson: JSON.stringify({ merchantId }),
      occurredAt: new Date("2024-01-01T12:00:00.000Z"),
      receivedAt: new Date("2024-01-01T12:00:01.000Z"),
    },
  ]);
}

/** Stubs global fetch to return a Clover payment for the given payment id. */
function stubCloverPayment(paymentId: string) {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes(`/payments/${paymentId}`)) {
      return new Response(
        JSON.stringify({
          id: paymentId,
          total: 1000,
          createdTime: new Date("2024-01-01T12:00:00.000Z").getTime(),
          lineItems: { elements: [] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
}
