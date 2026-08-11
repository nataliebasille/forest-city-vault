import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import { dbSchema } from "@forest-city-vault/infrastructure-database";
import { ConfigProvider, Effect, Exit } from "effect";
import { NextRequest } from "next/server";

import { encryptToken } from "@forest-city-vault/infrastructure-clover";
import { makeRouteTest } from "@/lib/testing/make-route-test";

const ENCRYPTION_KEY = "test-token-encryption-key";
const PROCESSOR_SECRET = "test-processor-secret";
const PROCESSOR_CONFIG_PROVIDER = ConfigProvider.fromMap(
  new Map([["CLOVER_PROCESSOR_SECRET", PROCESSOR_SECRET]]),
);

let pooledRuntimeAcquireCount = 0;

process.env.CLOVER_PROCESSOR_SECRET = PROCESSOR_SECRET;

const {
  db,
  module: { POST, internalProcessorRoute },
} = await makeRouteTest<typeof import("./route")>(import.meta.url, "./route", {
  tokenEncryptionKey: ENCRYPTION_KEY,
  processorSecret: PROCESSOR_SECRET,
  onPooledRuntimeAcquire: () => {
    pooledRuntimeAcquireCount += 1;
  },
});

describe("POST /api/process/payments", () => {
  test("processes a payment when called with the correct bearer token", async () => {
    await seedMerchantToken("merchant-ok", "valid-access-token");
    await insertInboxMessage("merchant-ok", "payment-ok", "P:payment-ok");
    stubCloverPayment("payment-ok");

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);

    const inboxRows = await db.select().from(dbSchema.inboxes.payments.inbox);
    const message = inboxRows.find((r) => r.providerObjectId === "payment-ok");
    assert.ok(message, "expected the inbox message to exist");
    assert.equal(message.status, "processed");

    const sales = await db.select().from(dbSchema.sales);
    assert.equal(sales.length, 1, "expected one sale to be created");

    // A captured Clover payment ("SUCCESS") normalizes to `paid`.
    assert.equal(sales[0].paymentStatus, "paid");

    // The stubbed order has no line items, so the sale must carry its header
    // totals from the payment yet record zero line items — never a fabricated
    // placeholder item.
    assert.equal(Number(sales[0].totalCents), 1000);
    assert.equal(Number(sales[0].subtotalCents), 1000);

    const lineItems = (await db.select().from(dbSchema.salesLineItems)).filter(
      (row) => row.saleId === sales[0].id,
    );
    assert.equal(
      lineItems.length,
      0,
      "expected no line item for an order with no line items",
    );
  });

  test("records a sale line item from the payment's order line items", async () => {
    await seedMerchantToken("merchant-items", "valid-access-token");
    await insertInboxMessage(
      "merchant-items",
      "payment-items",
      "P:payment-items",
    );
    stubCloverOrderFlow("payment-items", "order-items", [
      {
        id: "line-1",
        name: "Vintage denim jacket",
        // Clover returns monetary values as strings in cents.
        price: "2499",
        item: { id: "clover-item-1" },
      },
    ]);

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const sales = await db.select().from(dbSchema.sales);
    const sale = sales.find((s) => s.cloverPaymentId === "payment-items");
    assert.ok(sale, "expected the sale to be created");

    const lineItems = (await db.select().from(dbSchema.salesLineItems)).filter(
      (row) => row.saleId === sale.id,
    );
    assert.equal(lineItems.length, 1, "expected one sale line item");
    // The Clover *item* id (not the line item id) is stored, so the line item
    // resolves its vendor via vendor_items.clover_item_id.
    assert.equal(lineItems[0].cloverItemId, "clover-item-1");
    assert.equal(lineItems[0].name, "Vintage denim jacket");
    assert.equal(Number(lineItems[0].quantity), 1);
    assert.equal(Number(lineItems[0].grossAmountCents), 2499);
    assert.equal(Number(lineItems[0].discountAmountCents), 0);
    assert.equal(Number(lineItems[0].netAmountCents), 2499);
  });

  test("ingests a non-SUCCESS (failed) payment and stores its result", async () => {
    await seedMerchantToken("merchant-fail", "valid-access-token");
    await insertInboxMessage("merchant-fail", "payment-fail", "P:payment-fail");

    // The payment fetch reports a failed attempt. It is still ingested as a sale
    // (never skipped), carrying its Clover result so it can be reconciled
    // downstream.
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/payments/payment-fail")) {
        return new Response(
          JSON.stringify({
            id: "payment-fail",
            amount: 899,
            createdTime: new Date("2024-01-01T12:00:00.000Z").getTime(),
            order: { id: "order-fail" },
            result: "FAIL",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/orders/order-fail")) {
        return new Response(
          JSON.stringify({ id: "order-fail", lineItems: { elements: [] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);

    const inboxRows = await db.select().from(dbSchema.inboxes.payments.inbox);
    const message = inboxRows.find(
      (r) => r.providerObjectId === "payment-fail",
    );
    assert.ok(message, "expected the inbox message to exist");
    assert.equal(message.status, "processed");

    const sales = await db.select().from(dbSchema.sales);
    const sale = sales.find((s) => s.cloverPaymentId === "payment-fail");
    assert.ok(sale, "expected the failed payment to be ingested as a sale");
    assert.equal(sale.paymentStatus, "rejected");
    assert.equal(Number(sale.totalCents), 899);
  });

  test("normalizes an in-progress Clover result to `incomplete`", async () => {
    await seedMerchantToken("merchant-auth", "valid-access-token");
    await insertInboxMessage("merchant-auth", "payment-auth", "P:payment-auth");

    // An authorized-but-not-captured payment ("AUTH") is neither paid nor
    // rejected; it normalizes to `incomplete` and is still ingested.
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/payments/payment-auth")) {
        return new Response(
          JSON.stringify({
            id: "payment-auth",
            amount: 500,
            createdTime: new Date("2024-01-01T12:00:00.000Z").getTime(),
            order: { id: "order-auth" },
            result: "AUTH",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/orders/order-auth")) {
        return new Response(
          JSON.stringify({ id: "order-auth", lineItems: { elements: [] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const sales = await db.select().from(dbSchema.sales);
    const sale = sales.find((s) => s.cloverPaymentId === "payment-auth");
    assert.ok(sale, "expected the payment to be ingested as a sale");
    assert.equal(sale.paymentStatus, "incomplete");
  });

  test("returns 401 when authorization header is missing", async () => {
    const response = await POST(processRequest());
    const body = await response.text();

    assert.equal(response.status, 401);
    assert.equal(body.includes(PROCESSOR_SECRET), false);
  });

  test("returns 401 when authorization scheme is not bearer", async () => {
    const response = await POST(
      processRequest({
        authorization: "Basic abc123",
      }),
    );

    assert.equal(response.status, 401);
  });

  test("returns 401 when bearer token is empty", async () => {
    const response = await POST(
      processRequest({
        authorization: "Bearer ",
      }),
    );

    assert.equal(response.status, 401);
  });

  test("returns 401 when bearer token is incorrect", async () => {
    const response = await POST(
      processRequest({
        authorization: "Bearer not-the-secret",
      }),
    );
    const body = await response.text();

    assert.equal(response.status, 401);
    assert.equal(body.includes("not-the-secret"), false);
    assert.equal(body.includes(PROCESSOR_SECRET), false);
  });

  test("returns 401 when authorization header is malformed", async () => {
    const response = await POST(
      processRequest({
        authorization: "Bearer alpha, Bearer beta",
      }),
    );

    assert.equal(response.status, 401);
  });

  test("unauthorized requests do not invoke processing side effects", async () => {
    await seedMerchantToken("merchant-unauthorized", "valid-access-token");
    await insertInboxMessage(
      "merchant-unauthorized",
      "payment-unauthorized",
      "P:payment-unauthorized",
    );

    const fetchStub = mock.method(globalThis, "fetch", async () => {
      throw new Error("fetch should not be called for unauthorized requests");
    });

    const before = await db.select().from(dbSchema.inboxes.payments.inbox);
    const beforeMessage = before.find(
      (row) => row.providerObjectId === "payment-unauthorized",
    );
    assert.ok(beforeMessage, "expected seeded inbox message");

    const response = await POST(
      processRequest({
        authorization: "Bearer wrong-secret",
      }),
    );

    mock.restoreAll();

    assert.equal(response.status, 401);
    assert.equal(fetchStub.mock.callCount(), 0);

    const after = await db.select().from(dbSchema.inboxes.payments.inbox);
    const afterMessage = after.find(
      (row) => row.providerObjectId === "payment-unauthorized",
    );
    assert.ok(afterMessage, "expected seeded inbox message");
    assert.equal(afterMessage.status, beforeMessage.status);
    assert.equal(afterMessage.attempts, beforeMessage.attempts);
  });

  test("unauthorized requests do not leak secrets in logs", async () => {
    const logs = await captureConsole(() =>
      POST(
        processRequest({
          authorization: "Bearer leaked-token-value",
        }),
      ),
    );

    assert.equal(logs.includes("leaked-token-value"), false);
    assert.equal(logs.includes(PROCESSOR_SECRET), false);
  });

  test("records a terminal failure when the merchant is not connected", async () => {
    await insertInboxMessage(
      "merchant-missing",
      "payment-missing",
      "P:payment-missing",
    );

    const response = await POST(processRequest(authHeader()));
    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);

    const inboxRows = await db.select().from(dbSchema.inboxes.payments.inbox);
    const message = inboxRows.find(
      (r) => r.providerObjectId === "payment-missing",
    );
    assert.ok(message, "expected the inbox message to exist");
    assert.equal(message.status, "failed");
    assert.ok(message.attempts >= 1, "message should have been attempted");

    const errorRows = await db.select().from(dbSchema.inboxes.payments.errors);
    const recorded = errorRows.filter((e) => e.inboxId === message.id);
    assert.equal(
      recorded.length,
      1,
      "expected exactly one error row for the failed message",
    );
    assert.equal(recorded[0].attemptNumber, message.attempts);
    assert.ok(recorded[0].error.length > 0);

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
    // A line discount larger than the gross drives the net amount negative,
    // which the non-negative DB check rejects — so the line-item insert fails
    // *after* the sale row is written, exercising the transactional rollback.
    stubCloverOrderFlow("payment-writefail", "order-writefail", [
      {
        id: "line-writefail",
        name: "Test item",
        price: 1000,
        item: { id: "clover-item-writefail" },
        discounts: { elements: [{ amount: -2000 }] },
      },
    ]);

    const salesBefore = (await db.select().from(dbSchema.sales)).length;
    const lineItemsBefore = (await db.select().from(dbSchema.salesLineItems))
      .length;

    const response = await POST(processRequest(authHeader()));

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

    const errorRows = await db.select().from(dbSchema.inboxes.payments.errors);
    const recorded = errorRows.filter((e) => e.inboxId === message.id);
    assert.equal(
      recorded.length,
      1,
      "expected exactly one error row for the failed message",
    );

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

  test("returns 200 with an empty inbox when authorized", async () => {
    const response = await POST(processRequest(authHeader()));
    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);
  });

  test("rejects overlapping invocations while one run is active in this process", async () => {
    const started = deferred<void>();
    const release = deferred<void>();

    const overlapPOST = internalProcessorRoute(() =>
      Effect.gen(function* () {
        started.resolve();
        yield* Effect.promise(() => release.promise);
        return true;
      }),
    );

    const firstRequest = Effect.runPromiseExit(
      overlapPOST(processRequest(authHeader())).pipe(
        Effect.withConfigProvider(PROCESSOR_CONFIG_PROVIDER),
      ) as never,
    );
    await started.promise;

    const overlap = await Effect.runPromiseExit(
      overlapPOST(processRequest(authHeader())).pipe(
        Effect.withConfigProvider(PROCESSOR_CONFIG_PROVIDER),
      ) as never,
    );

    release.resolve();
    const firstResponse = await firstRequest;

    assert.equal(Exit.isSuccess(firstResponse), true);
    assert.equal(Exit.isFailure(overlap), true);
  });
});

function processRequest(headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/process/payments", {
    method: "POST",
    headers,
  });
}

function authHeader(token = PROCESSOR_SECRET) {
  return { authorization: `Bearer ${token}` };
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

function stubCloverPayment(paymentId: string) {
  stubCloverOrderFlow(paymentId, `${paymentId}-order`, []);
}

// Stubs the two-step fetch the drain performs: GET the payment (which references
// an order), then GET that order with its line items expanded.
function stubCloverOrderFlow(
  paymentId: string,
  orderId: string,
  lineItems: ReadonlyArray<Record<string, unknown>>,
) {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes(`/payments/${paymentId}`)) {
      return new Response(
        JSON.stringify({
          id: paymentId,
          amount: 1000,
          result: "SUCCESS",
          createdTime: new Date("2024-01-01T12:00:00.000Z").getTime(),
          order: { id: orderId },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes(`/orders/${orderId}`)) {
      return new Response(
        JSON.stringify({ id: orderId, lineItems: { elements: lineItems } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
}

async function captureConsole(fn: () => Promise<unknown>) {
  const lines: string[] = [];
  const push = (chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  };
  mock.method(process.stdout, "write", push);
  mock.method(process.stderr, "write", push);
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    mock.method(console, method, (...args: unknown[]) =>
      push(args.map((a) => String(a)).join(" ")),
    );
  }

  try {
    await fn();
  } finally {
    mock.restoreAll();
  }

  return lines.join("\n");
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
}
