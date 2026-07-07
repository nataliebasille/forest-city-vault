import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { dbSchema } from "@forest-city-vault/infrastructure-database";
import { testRoute } from "@forest-city-vault/nextjs-core";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import {
  cloverHttpClientMock,
  makeCloverTestContext,
  type CloverMockResponse,
} from "@/lib/testing/test-context";
import { POST } from "./route";

// Canned Clover payment responses keyed by paymentId. Each test seeds the
// entries it needs; the mock HTTP client (below) serves them so we can drive
// both the success and failure branches of `getCloverPayment` without a real
// Clover API. Anything not registered comes back as a 404.
const cloverResponses = new Map<string, CloverMockResponse>();

const httpClient = cloverHttpClientMock(
  ({ paymentId }) =>
    cloverResponses.get(paymentId) ?? {
      status: 404,
      body: { message: `no mock for ${paymentId}` },
    },
);

process.env.CLOVER_ACCESS_TOKEN = "test-access-token";

const { db, reset, layer } = await makeCloverTestContext({ httpClient });

const { inbox, errors } = dbSchema.inboxes.payments;

const runRoute = testRoute(POST, { layer });

async function post() {
  return runRoute(
    new NextRequest("http://localhost/api/process/payments", {
      method: "POST",
    }),
  );
}

let seq = 0;

interface SeedOptions {
  merchantId?: string;
  providerObjectId?: string;
  status?: "received" | "processed" | "failed" | "dead_letter";
  attempts?: number;
  payloadJson?: string;
  receivedAt?: Date;
  /**
   * Overrides the auto-generated idempotency key. Provide it to exercise the
   * inbox's unique-key dedup (e.g. two events that must collapse to one row);
   * otherwise each seeded row gets a fresh, unique key.
   */
  idempotencyKey?: string;
  /**
   * The canned Clover payment lookup for this item. When provided it is
   * registered in the mock HTTP client keyed by this item's `providerObjectId`,
   * so a test seeds the inbox row and its matching Clover response in one call.
   * Omit it for items whose Clover payment should never be fetched (e.g. a
   * malformed payload that fails before the lookup).
   */
  cloverResponse?: CloverMockResponse;
}

async function seedInbox(options: SeedOptions = {}) {
  const n = ++seq;
  const merchantId = options.merchantId ?? "merchant-1";
  const providerObjectId = options.providerObjectId ?? `payment-${n}`;

  await db.insert(inbox).values([
    {
      requestId: `req-${n}`,
      status: options.status ?? "received",
      attempts: options.attempts ?? 0,
      idempotencyKey:
        options.idempotencyKey ??
        `app-1:${merchantId}:P:${providerObjectId}:CREATE:${n}`,
      provider: "clover",
      providerEventId: `P:${providerObjectId}`,
      providerObjectId,
      eventType: "payment",
      payloadJson: options.payloadJson ?? JSON.stringify({ merchantId }),
      occurredAt: new Date("2024-01-01T12:00:00.000Z"),
      receivedAt: options.receivedAt ?? new Date("2024-01-01T12:00:01.000Z"),
    },
  ]);

  if (options.cloverResponse) {
    cloverResponses.set(providerObjectId, options.cloverResponse);
  }

  return { providerObjectId, merchantId };
}

function cloverPaymentBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "clover-payment-id",
    total: 1300,
    createdTime: Date.parse("2024-06-15T10:00:00.000Z"),
    lineItems: {
      elements: [
        { id: "li-1", name: "Coffee", price: 500, quantity: 2 },
        { id: "li-2", name: "Bagel", price: 300, quantity: 1 },
      ],
    },
    ...overrides,
  };
}

beforeEach(async () => {
  cloverResponses.clear();
  await reset();
});

describe("POST /api/process/payments", () => {
  test("returns 200 with an empty inbox", async () => {
    const response = await post();

    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);
  });

  test("creates the correct sale from a Clover payment with line items", async () => {
    const { providerObjectId, merchantId } = await seedInbox({
      providerObjectId: "payment-with-items",
      cloverResponse: { body: cloverPaymentBody() },
    });

    const response = await post();
    assert.equal(response.status, 200);

    const inboxRows = await db
      .select()
      .from(inbox)
      .where(eq(inbox.providerObjectId, providerObjectId));
    assert.equal(inboxRows.length, 1);
    assert.equal(inboxRows[0].status, "processed");
    assert.equal(inboxRows[0].attempts, 1);

    const saleRows = await db
      .select()
      .from(dbSchema.sales)
      .where(eq(dbSchema.sales.cloverPaymentId, providerObjectId));
    assert.equal(saleRows.length, 1);

    const sale = saleRows[0];
    assert.equal(sale.source, "clover");
    assert.equal(sale.cloverMerchantId, merchantId);
    assert.equal(sale.cloverPaymentId, providerObjectId);
    // The sale is tied back to its originating payment by the inbox's
    // idempotency key, which is stored (and enforced unique) on the sale.
    assert.equal(sale.cloverIdempotencyKey, inboxRows[0].idempotencyKey);
    assert.equal(
      sale.occurredAt.getTime(),
      Date.parse("2024-06-15T10:00:00.000Z"),
    );
    // subtotal/total accumulate from line items: 500*2 + 300*1 = 1300.
    assert.equal(sale.subtotalCents, BigInt(1300));
    assert.equal(sale.totalCents, BigInt(1300));
    assert.equal(sale.taxCents, BigInt(0));
    assert.equal(sale.discountCents, BigInt(0));

    const lineItems = await db
      .select()
      .from(dbSchema.salesLineItems)
      .where(eq(dbSchema.salesLineItems.saleId, sale.id));
    assert.equal(lineItems.length, 2);

    const byName = Object.fromEntries(
      lineItems.map((item) => [item.name, item]),
    );

    assert.equal(byName.Coffee.quantity, BigInt(2));
    assert.equal(byName.Coffee.grossAmountCents, BigInt(1000));
    assert.equal(byName.Coffee.netAmountCents, BigInt(1000));
    assert.equal(byName.Coffee.discountAmountCents, BigInt(0));

    assert.equal(byName.Bagel.quantity, BigInt(1));
    assert.equal(byName.Bagel.grossAmountCents, BigInt(300));
    assert.equal(byName.Bagel.netAmountCents, BigInt(300));

    // No error rows on the happy path.
    const errorRows = await db.select().from(errors);
    assert.equal(errorRows.length, 0);
  });

  test("creates an aggregate 'Payment' line item when the Clover payment has none", async () => {
    const { providerObjectId } = await seedInbox({
      providerObjectId: "payment-no-items",
      cloverResponse: {
        body: {
          id: "clover-payment-id",
          total: 2500,
          taxAmount: 200,
          discountAmount: 100,
          createdTime: Date.parse("2024-06-15T10:00:00.000Z"),
        },
      },
    });

    const response = await post();
    assert.equal(response.status, 200);

    const saleRows = await db
      .select()
      .from(dbSchema.sales)
      .where(eq(dbSchema.sales.cloverPaymentId, providerObjectId));
    assert.equal(saleRows.length, 1);
    const sale = saleRows[0];
    assert.equal(sale.subtotalCents, BigInt(2500));
    assert.equal(sale.totalCents, BigInt(2500));
    assert.equal(sale.taxCents, BigInt(200));
    assert.equal(sale.discountCents, BigInt(100));

    const lineItems = await db
      .select()
      .from(dbSchema.salesLineItems)
      .where(eq(dbSchema.salesLineItems.saleId, sale.id));
    assert.equal(lineItems.length, 1);
    assert.equal(lineItems[0].name, "Payment");
    assert.equal(lineItems[0].quantity, BigInt(1));
    assert.equal(lineItems[0].grossAmountCents, BigInt(2500));
    assert.equal(lineItems[0].netAmountCents, BigInt(2500));
    assert.equal(lineItems[0].discountAmountCents, BigInt(100));
  });

  test("marks the item failed and records an error when the Clover fetch fails", async () => {
    const { providerObjectId } = await seedInbox({
      providerObjectId: "payment-http-500",
      cloverResponse: {
        status: 500,
        body: { message: "clover exploded" },
      },
    });

    const response = await post();
    assert.equal(response.status, 200);

    const inboxRows = await db
      .select()
      .from(inbox)
      .where(eq(inbox.providerObjectId, providerObjectId));
    assert.equal(inboxRows[0].status, "failed");
    assert.equal(inboxRows[0].attempts, 1);

    // The failing item's sale insert was rolled back with its transaction.
    const saleRows = await db
      .select()
      .from(dbSchema.sales)
      .where(eq(dbSchema.sales.cloverPaymentId, providerObjectId));
    assert.equal(saleRows.length, 0);

    const errorRows = await db
      .select()
      .from(errors)
      .where(eq(errors.inboxId, inboxRows[0].id));
    assert.equal(errorRows.length, 1);
    assert.equal(errorRows[0].attemptNumber, 1);
    assert.ok(
      errorRows[0].requestId.length > 0,
      "error should record the request id",
    );
    assert.ok(
      errorRows[0].error.length > 0,
      "error payload should be recorded",
    );
  });

  test("fails and records an error when the payload JSON is malformed", async () => {
    const { providerObjectId } = await seedInbox({
      providerObjectId: "payment-bad-payload",
      payloadJson: "not-json",
    });

    const response = await post();
    assert.equal(response.status, 200);

    const inboxRows = await db
      .select()
      .from(inbox)
      .where(eq(inbox.providerObjectId, providerObjectId));
    assert.equal(inboxRows[0].status, "failed");
    assert.equal(inboxRows[0].attempts, 1);

    const saleRows = await db.select().from(dbSchema.sales);
    assert.equal(saleRows.length, 0);

    const errorRows = await db
      .select()
      .from(errors)
      .where(eq(errors.inboxId, inboxRows[0].id));
    assert.equal(errorRows.length, 1);
  });

  test("processes a batch where one payment fails without affecting the others", async () => {
    const ok1 = await seedInbox({
      providerObjectId: "batch-ok-1",
      cloverResponse: {
        body: cloverPaymentBody({
          lineItems: {
            elements: [{ id: "li", name: "Tea", price: 400, quantity: 1 }],
          },
        }),
      },
    });
    const bad = await seedInbox({
      providerObjectId: "batch-bad",
      cloverResponse: {
        status: 500,
        body: { message: "boom" },
      },
    });
    const ok2 = await seedInbox({
      providerObjectId: "batch-ok-2",
      cloverResponse: {
        body: cloverPaymentBody({
          lineItems: {
            elements: [{ id: "li", name: "Muffin", price: 250, quantity: 3 }],
          },
        }),
      },
    });

    const response = await post();
    assert.equal(response.status, 200);

    const rows = await db.select().from(inbox);
    const statusByObject = Object.fromEntries(
      rows.map((row) => [row.providerObjectId, row.status]),
    );
    assert.equal(statusByObject[ok1.providerObjectId], "processed");
    assert.equal(statusByObject[ok2.providerObjectId], "processed");
    assert.equal(statusByObject[bad.providerObjectId], "failed");

    // Both successful payments produced sales; the failing one did not.
    const sales = await db.select().from(dbSchema.sales);
    const salesByPayment = Object.fromEntries(
      sales.map((sale) => [sale.cloverPaymentId, sale]),
    );
    assert.ok(salesByPayment[ok1.providerObjectId]);
    assert.ok(salesByPayment[ok2.providerObjectId]);
    assert.equal(salesByPayment[bad.providerObjectId], undefined);

    assert.equal(salesByPayment[ok1.providerObjectId].totalCents, BigInt(400));
    assert.equal(salesByPayment[ok2.providerObjectId].totalCents, BigInt(750));

    // Exactly one error row, for the failing payment.
    const badInbox = rows.find(
      (row) => row.providerObjectId === bad.providerObjectId,
    )!;
    const errorRows = await db.select().from(errors);
    assert.equal(errorRows.length, 1);
    assert.equal(errorRows[0].inboxId, badInbox.id);
  });

  test("moves an item to dead_letter once it hits the max attempt count", async () => {
    const { providerObjectId } = await seedInbox({
      providerObjectId: "payment-dead-letter",
      attempts: 4,
      cloverResponse: {
        status: 500,
        body: { message: "still failing" },
      },
    });

    const response = await post();
    assert.equal(response.status, 200);

    const inboxRows = await db
      .select()
      .from(inbox)
      .where(eq(inbox.providerObjectId, providerObjectId));
    assert.equal(inboxRows[0].status, "dead_letter");
    assert.equal(inboxRows[0].attempts, 5);

    const errorRows = await db
      .select()
      .from(errors)
      .where(eq(errors.inboxId, inboxRows[0].id));
    assert.equal(errorRows.length, 1);
    assert.equal(errorRows[0].attemptNumber, 5);
  });

  test("only processes received items and leaves others untouched", async () => {
    const received = await seedInbox({
      providerObjectId: "fresh",
      cloverResponse: {
        body: cloverPaymentBody({
          lineItems: {
            elements: [{ id: "li", name: "Soda", price: 200, quantity: 1 }],
          },
        }),
      },
    });
    // Register a payment for the processed item too; it must NOT be fetched.
    const alreadyProcessed = await seedInbox({
      providerObjectId: "already-processed",
      status: "processed",
      attempts: 1,
      cloverResponse: { body: cloverPaymentBody() },
    });

    const response = await post();
    assert.equal(response.status, 200);

    const processedRow = (
      await db
        .select()
        .from(inbox)
        .where(eq(inbox.providerObjectId, alreadyProcessed.providerObjectId))
    )[0];
    // Untouched: attempts stay at their seeded value.
    assert.equal(processedRow.status, "processed");
    assert.equal(processedRow.attempts, 1);

    // Only the received item produced a sale.
    const sales = await db.select().from(dbSchema.sales);
    assert.equal(sales.length, 1);
    assert.equal(sales[0].cloverPaymentId, received.providerObjectId);
  });

  test("is idempotent: reprocessing the same key never creates a duplicate sale", async () => {
    const { providerObjectId } = await seedInbox({
      providerObjectId: "payment-idempotent",
      cloverResponse: {
        body: cloverPaymentBody({
          lineItems: {
            elements: [{ id: "li", name: "Latte", price: 450, quantity: 1 }],
          },
        }),
      },
    });

    // Drain the inbox twice. The first run turns the received item into a sale
    // and marks it "processed"; the second run must skip it (it is no longer
    // "received"), so the one idempotency key can never yield a second sale.
    const first = await post();
    const second = await post();
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const inboxRows = await db
      .select()
      .from(inbox)
      .where(eq(inbox.providerObjectId, providerObjectId));
    assert.equal(inboxRows.length, 1);
    assert.equal(inboxRows[0].status, "processed");
    assert.equal(
      inboxRows[0].attempts,
      1,
      "the item should be processed exactly once",
    );

    // Exactly one sale for the key — the second drain produced nothing.
    const saleRows = await db
      .select()
      .from(dbSchema.sales)
      .where(eq(dbSchema.sales.cloverPaymentId, providerObjectId));
    assert.equal(
      saleRows.length,
      1,
      "exactly one sale should exist for the idempotency key",
    );

    // And its line items were not duplicated either.
    const lineItems = await db
      .select()
      .from(dbSchema.salesLineItems)
      .where(eq(dbSchema.salesLineItems.saleId, saleRows[0].id));
    assert.equal(lineItems.length, 1);
  });

  test("rejects a second inbox row that reuses an idempotency key", async () => {
    await seedInbox({
      providerObjectId: "payment-dup-key",
      idempotencyKey: "app-1:merchant-1:P:payment-dup-key:CREATE",
    });

    // The unique index on `idempotency_key` is what guarantees a provider event
    // is ingested at most once, so it can only ever become a single sale.
    await assert.rejects(
      seedInbox({
        providerObjectId: "payment-dup-key-again",
        idempotencyKey: "app-1:merchant-1:P:payment-dup-key:CREATE",
      }),
      "a duplicate idempotency key must be rejected by the unique index",
    );

    const rows = await db
      .select()
      .from(inbox)
      .where(
        eq(inbox.idempotencyKey, "app-1:merchant-1:P:payment-dup-key:CREATE"),
      );
    assert.equal(rows.length, 1, "only the first row should have been stored");
  });

  test("the sales unique index rejects a second sale for the same idempotency key", async () => {
    // Backstop below the inbox dedup: even if two distinct sales (different ids)
    // were ever recorded from the same payment, the unique index on the sale's
    // clover idempotency key guarantees a payment maps to at most one sale.
    const idempotencyKey = "app-1:merchant-1:P:payment-unique-sale:CREATE";

    const baseSale = {
      source: "clover" as const,
      cloverMerchantId: "merchant-1",
      cloverPaymentId: "payment-unique-sale",
      cloverIdempotencyKey: idempotencyKey,
      occurredAt: new Date("2024-06-15T10:00:00.000Z"),
      subtotalCents: BigInt(1000),
      taxCents: BigInt(0),
      discountCents: BigInt(0),
      totalCents: BigInt(1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db
      .insert(dbSchema.sales)
      .values([{ id: crypto.randomUUID(), ...baseSale }]);

    await assert.rejects(
      db.insert(dbSchema.sales).values([
        {
          id: crypto.randomUUID(),
          ...baseSale,
          cloverPaymentId: "payment-unique-sale-again",
        },
      ]),
      "a second sale with the same idempotency key must be rejected",
    );

    const saleRows = await db
      .select()
      .from(dbSchema.sales)
      .where(eq(dbSchema.sales.cloverIdempotencyKey, idempotencyKey));
    assert.equal(saleRows.length, 1, "only one sale should exist for the key");
  });
});
