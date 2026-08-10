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

    // The stubbed payment has no line items, so the sale must carry its header
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
      "expected no line item for a payment with no line items",
    );
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
    stubCloverPaymentWithLineItem("payment-writefail", { quantity: 0 });

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
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes(`/payments/${paymentId}`)) {
      return new Response(
        JSON.stringify({
          id: paymentId,
          amount: 1000,
          createdTime: new Date("2024-01-01T12:00:00.000Z").getTime(),
          lineItems: { elements: [] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
}

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
          amount: 1000,
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
