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
    const inboxRows = await db.select().from(dbSchema.inboxes.payments.inbox);
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

    const inboxRows = await db.select().from(dbSchema.inboxes.payments.inbox);
    const message = inboxRows.find(
      (r) => r.providerObjectId === "payment-missing",
    );
    assert.ok(message, "expected the inbox message to exist");
    // No token row for the merchant → MerchantNotConnectedError → failed attempt.
    assert.equal(message.status, "failed");
    assert.ok(message.attempts >= 1, "message should have been attempted");

    // The failure is recorded in the inbox errors table, on a connection outside
    // the (rolled-back) message saga, so the bookkeeping survives.
    const errorRows = await db.select().from(dbSchema.inboxes.payments.errors);
    const recorded = errorRows.filter((e) => e.inboxId === message.id);
    assert.equal(
      recorded.length,
      1,
      "expected exactly one error row for the failed message",
    );
    assert.equal(recorded[0].attemptNumber, message.attempts);
    assert.ok(
      recorded[0].error.length > 0,
      "the failure detail should be recorded",
    );

    // The message failed before building a sale, so none was persisted for it.
    const sales = await db.select().from(dbSchema.sales);
    const salesForMessage = sales.filter(
      (s) => s.cloverPaymentId === "payment-missing",
    );
    assert.equal(salesForMessage.length, 0, "expected no sale to be created");
  });

  test("rolls back the sale and records an error when the save fails after a write", async () => {
    await seedMerchantToken("merchant-writefail", "valid-access-token");
    await insertInboxMessage(
      "merchant-writefail",
      "payment-writefail",
      "P:payment-writefail",
    );
    // A line item with quantity 0 passes the domain but violates the
    // `sales_line_items` CHECK (quantity > 0). The repository inserts the `sales`
    // row first, then the line items — so the sale row is written and then the
    // save fails, forcing the message saga to roll back.
    stubCloverPaymentWithLineItem("payment-writefail", { quantity: 0 });

    // Shared test database: capture counts so we assert this message adds no
    // sale rows, independent of what earlier tests persisted.
    const salesBefore = (await db.select().from(dbSchema.sales)).length;
    const lineItemsBefore = (await db.select().from(dbSchema.salesLineItems))
      .length;

    const response = await POST(processRequest());

    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);

    const inboxRows = await db.select().from(dbSchema.inboxes.payments.inbox);
    const message = inboxRows.find(
      (r) => r.providerObjectId === "payment-writefail",
    );
    assert.ok(message, "expected the inbox message to exist");
    assert.equal(message.status, "failed");
    assert.ok(message.attempts >= 1, "message should have been attempted");

    // The failure bookkeeping is committed even though the message saga rolled
    // back.
    const errorRows = await db.select().from(dbSchema.inboxes.payments.errors);
    const recorded = errorRows.filter((e) => e.inboxId === message.id);
    assert.equal(
      recorded.length,
      1,
      "expected exactly one error row for the failed message",
    );

    // The sale row written before the constraint violation must be rolled back
    // together with the failed message saga: no new sale or line item persists,
    // and none exists for this payment.
    const salesAfter = await db.select().from(dbSchema.sales);
    assert.equal(
      salesAfter.length,
      salesBefore,
      "the sale written before the failure should be rolled back",
    );
    assert.ok(
      !salesAfter.some((s) => s.cloverPaymentId === "payment-writefail"),
      "no sale should persist for the failed payment",
    );
    const lineItemsAfter = (await db.select().from(dbSchema.salesLineItems))
      .length;
    assert.equal(
      lineItemsAfter,
      lineItemsBefore,
      "the line item write should be rolled back",
    );
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

/**
 * Stubs global fetch to return a Clover payment carrying a single line item with
 * the given quantity. A quantity of 0 passes the domain but violates the
 * `sales_line_items` CHECK (quantity > 0) at save time.
 */
function stubCloverPaymentWithLineItem(
  paymentId: string,
  lineItem: { quantity: number },
) {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes(`/payments/${paymentId}`)) {
      return new Response(
        JSON.stringify({
          id: paymentId,
          total: 1000,
          createdTime: new Date("2024-01-01T12:00:00.000Z").getTime(),
          lineItems: {
            elements: [
              {
                id: `${paymentId}-item`,
                name: "Test item",
                price: 1000,
                quantity: lineItem.quantity,
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
}
