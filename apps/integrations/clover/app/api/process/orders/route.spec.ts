import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";

import { dbSchema } from "@forest-city-vault/infrastructure-database";
import { NextRequest } from "next/server";
import { makeRouteTest } from "@/lib/testing/make-route-test";

const PROCESSOR_SECRET = "test-processor-secret";
const MERCHANT_ID = "test-merchant-id";

process.env.CLOVER_PROCESSOR_SECRET = PROCESSOR_SECRET;

const {
  db,
  module: { POST },
} = await makeRouteTest<typeof import("./route")>(import.meta.url, "./route", {
  processorSecret: PROCESSOR_SECRET,
  merchantId: MERCHANT_ID,
  merchantAccessToken: "static-access-token",
});

describe("POST /api/process/orders", () => {
  test("processes an order and persists one order row with payment children", async () => {
    await insertInboxMessage("order-ok");
    stubCloverOrder("order-ok");

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);

    const inboxRows = await db.select().from(dbSchema.inboxes.orders.inbox);
    const message = inboxRows.find((row) => row.providerObjectId === "order-ok");
    assert.ok(message, "expected the inbox message to exist");
    assert.equal(message.status, "processed");

    const orderRows = await db.select().from(dbSchema.orders);
    assert.equal(orderRows.length, 1);
    assert.equal(orderRows[0].id, "order-ok");
    assert.equal(orderRows[0].status, "paid");
    assert.equal(Number(orderRows[0].collectedCents), 1100);

    const paymentRows = (await db.select().from(dbSchema.orderPayments)).filter(
      (row) => row.orderId === "order-ok",
    );
    assert.equal(paymentRows.length, 2);
    assert.equal(
      paymentRows.reduce((sum, row) => sum + Number(row.amountCents), 0),
      1100,
    );
  });

  test("returns 401 when bearer token is incorrect", async () => {
    const response = await POST(
      processRequest({ authorization: "Bearer invalid" }),
    );
    assert.equal(response.status, 401);
  });

  test("records a failure when Clover order fetch fails", async () => {
    await insertInboxMessage("order-missing");
    mock.method(
      globalThis,
      "fetch",
      async () => new Response("not found", { status: 404 }),
    );

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const inboxRows = await db.select().from(dbSchema.inboxes.orders.inbox);
    const message = inboxRows.find(
      (row) => row.providerObjectId === "order-missing",
    );
    assert.equal(message?.status, "failed");

    const errors = await db.select().from(dbSchema.inboxes.orders.errors);
    const linked = errors.filter((row) => row.inboxId === message?.id);
    assert.equal(linked.length, 1);
  });

  test("reprocesses an existing order when modifiedTime advances", async () => {
    await insertInboxMessage("order-revision", 1_700_000_000_000);
    stubCloverOrder("order-revision", {
      total: 1000,
      modifiedTime: new Date("2024-01-01T12:10:00.000Z").getTime(),
      payments: [
        {
          id: "PAY-R1",
          amount: 1000,
          tipAmount: 0,
          taxAmount: 0,
          result: "SUCCESS",
        },
      ],
    });

    await POST(processRequest(authHeader()));
    mock.restoreAll();

    await insertInboxMessage("order-revision", 1_700_000_000_001);
    stubCloverOrder("order-revision", {
      total: 1300,
      modifiedTime: new Date("2024-01-01T12:20:00.000Z").getTime(),
      payments: [
        {
          id: "PAY-R2",
          amount: 1300,
          tipAmount: 0,
          taxAmount: 0,
          result: "SUCCESS",
        },
      ],
    });

    const response = await POST(processRequest(authHeader()));
    mock.restoreAll();

    assert.equal(response.status, 200);

    const orderRows = (await db.select().from(dbSchema.orders)).filter(
      (row) => row.id === "order-revision",
    );
    assert.equal(orderRows.length, 1);
    assert.equal(Number(orderRows[0].collectedCents), 1300);

    const paymentRows = (await db.select().from(dbSchema.orderPayments)).filter(
      (row) => row.orderId === "order-revision",
    );
    assert.equal(paymentRows.length, 1);
    assert.equal(paymentRows[0].cloverPaymentId, "PAY-R2");
    assert.equal(Number(paymentRows[0].amountCents), 1300);
  });
});

function processRequest(headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/process/orders", {
    method: "POST",
    headers,
  });
}

function authHeader(token = PROCESSOR_SECRET) {
  return { authorization: "Bearer " + token };
}

async function insertInboxMessage(
  orderId: string,
  revisionTs = 1_700_000_000_000,
) {
  await db.insert(dbSchema.inboxes.orders.inbox).values([
    {
      requestId: `req-${orderId}`,
      status: "received",
      idempotencyKey: `app-1:${MERCHANT_ID}:O:${orderId}:${revisionTs}`,
      provider: "clover",
      providerEventId: `O:${orderId}`,
      providerObjectId: orderId,
      eventType: "upsert",
      payloadJson: JSON.stringify({ merchantId: MERCHANT_ID }),
      occurredAt: new Date(revisionTs),
      receivedAt: new Date("2024-01-01T12:00:01.000Z"),
    },
  ]);
}

function stubCloverOrder(
  orderId: string,
  overrides?: {
    total?: number;
    modifiedTime?: number;
    payments?: Array<{
      id: string;
      amount: number;
      tipAmount: number;
      taxAmount: number;
      result: string;
    }>;
  },
) {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);

    if (!url.includes(`/orders/${orderId}`)) {
      return new Response("not found", { status: 404 });
    }

    return new Response(
      JSON.stringify({
        id: orderId,
        total: overrides?.total ?? 1100,
        paymentState: "PAID",
        state: "OPEN",
        createdTime: new Date("2024-01-01T12:00:00.000Z").getTime(),
        modifiedTime:
          overrides?.modifiedTime ??
          new Date("2024-01-01T12:10:00.000Z").getTime(),
        lineItems: {
          elements: [
            {
              id: "LINE-1",
              name: "Vintage denim jacket",
              price: overrides?.total ?? 1100,
              item: { id: "ITEM-1" },
              refunded: false,
            },
          ],
        },
        payments: {
          elements: overrides?.payments ?? [
            {
              id: "PAY-1",
              amount: 700,
              tipAmount: 0,
              taxAmount: 80,
              result: "SUCCESS",
            },
            {
              id: "PAY-2",
              amount: 400,
              tipAmount: 0,
              taxAmount: 0,
              result: "SUCCESS",
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}
