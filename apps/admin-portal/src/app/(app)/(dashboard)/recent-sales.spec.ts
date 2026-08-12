import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BOOTSTRAP_STORE_ID,
  QueryableLive,
} from "@forest-city-vault/infrastructure-database";
import {
  orderLineItems,
  orders,
  stores,
  vendorItems,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect } from "effect";
import { RECENT_SALES_LIMIT, recentSales } from "./recent-sales";

const SEED_TS = new Date("2024-05-01T00:00:00.000Z");
const STORE_TZ = "America/Detroit";

const VENDOR_A = "01920000-0000-7000-8000-0000000000a1";
const VENDOR_B = "01920000-0000-7000-8000-0000000000a2";

type TestContext = Awaited<ReturnType<typeof makeDatabaseTestContext>>;
type Db = TestContext["db"];

function runRecentSales(layer: TestContext["layer"]) {
  return Effect.runPromise(
    recentSales.pipe(Effect.provide(QueryableLive), Effect.provide(layer)),
  );
}

async function seedStore(db: Db) {
  await db.insert(stores).values({
    id: BOOTSTRAP_STORE_ID,
    name: "Forest City Vault",
    status: "active",
    timeZone: STORE_TZ,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  });
}

describe("recentSales", () => {
  test("derives item, vendor, and time-zone facts per order, newest first", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    await db.insert(vendors).values([
      { id: VENDOR_A, name: "Aspen Woodworks", ...timestamps() },
      { id: VENDOR_B, name: "Birch & Co.", ...timestamps() },
    ]);

    // The vendor a line item belongs to is resolved by joining vendor_items on
    // clover_item_id, so each vendor-owned item needs a mapping row here.
    await db.insert(vendorItems).values([
      makeVendorItem(VENDOR_B, "LAMP", "Vintage brass lamp", 6000),
      makeVendorItem(VENDOR_A, "MUG", "Ceramic mug", 2500),
      makeVendorItem(VENDOR_A, "PIN", "Enamel pin", 1200),
      makeVendorItem(VENDOR_A, "BLANKET", "Wool throw blanket", 2500),
    ]);

    const newest = orderId(3);
    const middle = orderId(2);
    const oldest = orderId(1);

    await db
      .insert(orders)
      .values([
        makeOrder(newest, "2024-06-01T18:00:00.000Z", 9700),
        makeOrder(middle, "2024-06-01T15:00:00.000Z", 2500),
        makeOrder(oldest, "2024-06-01T12:00:00.000Z", 4200),
      ]);

    await db.insert(orderLineItems).values([
      // Newest sale: three items across two vendors; the $60 lamp is the lead.
      makeLineItem(newest, "Vintage brass lamp", 6000, "LAMP"),
      makeLineItem(newest, "Ceramic mug", 2500, "MUG"),
      makeLineItem(newest, "Enamel pin", 1200, "PIN"),
      // Middle sale: single item, single vendor.
      makeLineItem(middle, "Wool throw blanket", 2500, "BLANKET"),
      // Oldest sale: two items whose clover items map to no vendor.
      makeLineItem(oldest, "Hand-thrown vase", 3000, "VASE"),
      makeLineItem(oldest, "Soy candle", 1200, "CANDLE"),
    ]);

    const result = await runRecentSales(layer);

    assert.deepEqual(
      result.map((sale) => ({
        ...sale,
        occurredAt: sale.occurredAt.toISOString(),
      })),
      [
        {
          id: newest,
          occurredAt: "2024-06-01T18:00:00.000Z",
          totalCents: 9700,
          timeZone: STORE_TZ,
          items: [
            {
              name: "Vintage brass lamp",
              vendorName: "Birch & Co.",
              amountCents: 6000,
            },
            {
              name: "Ceramic mug",
              vendorName: "Aspen Woodworks",
              amountCents: 2500,
            },
            {
              name: "Enamel pin",
              vendorName: "Aspen Woodworks",
              amountCents: 1200,
            },
          ],
        },
        {
          id: middle,
          occurredAt: "2024-06-01T15:00:00.000Z",
          totalCents: 2500,
          timeZone: STORE_TZ,
          items: [
            {
              name: "Wool throw blanket",
              vendorName: "Aspen Woodworks",
              amountCents: 2500,
            },
          ],
        },
        {
          id: oldest,
          occurredAt: "2024-06-01T12:00:00.000Z",
          totalCents: 4200,
          timeZone: STORE_TZ,
          items: [
            {
              name: "Hand-thrown vase",
              vendorName: null,
              amountCents: 3000,
            },
            { name: "Soy candle", vendorName: null, amountCents: 1200 },
          ],
        },
      ],
    );
  });

  test("returns an order with no line items as an empty summary", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const only = orderId(1);
    await db
      .insert(orders)
      .values(makeOrder(only, "2024-06-01T12:00:00.000Z", 800));

    const result = await runRecentSales(layer);

    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      id: only,
      occurredAt: new Date("2024-06-01T12:00:00.000Z"),
      totalCents: 800,
      timeZone: STORE_TZ,
      items: [],
    });
  });

  test("returns only the newest sales, capped at the limit", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const total = RECENT_SALES_LIMIT + 4;
    const rows = Array.from({ length: total }, (_, i) => {
      // Older as the index grows: index 0 is the newest.
      const occurredAt = new Date(
        Date.UTC(2024, 5, 1, 12, 0, 0) - i * 60 * 60 * 1000,
      ).toISOString();
      return makeOrder(orderId(total - i), occurredAt, 1000 + i);
    });
    await db.insert(orders).values(rows);

    const result = await runRecentSales(layer);

    assert.equal(result.length, RECENT_SALES_LIMIT);
    const times = result.map((sale) => sale.occurredAt.getTime());
    assert.deepEqual(
      times,
      [...times].sort((a, b) => b - a),
    );
    // The oldest four sales must have been dropped.
    assert.equal(
      result[0].occurredAt.toISOString(),
      "2024-06-01T12:00:00.000Z",
    );
  });

  test("excludes orders whose status is not paid", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const paid = orderId(3);
    const rejected = orderId(2);
    const incomplete = orderId(1);

    await db
      .insert(orders)
      .values([
        makeOrder(paid, "2024-06-01T18:00:00.000Z", 5000),
        makeOrder(rejected, "2024-06-01T17:00:00.000Z", 9999, "refunded"),
        makeOrder(incomplete, "2024-06-01T16:00:00.000Z", 8888, "incomplete"),
      ]);

    const result = await runRecentSales(layer);

    assert.deepEqual(
      result.map((sale) => sale.id),
      [paid],
    );
  });

  test("returns an empty list when the store has no orders", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const result = await runRecentSales(layer);

    assert.deepEqual(result, []);
  });
});

function timestamps() {
  return { createdAt: SEED_TS, updatedAt: SEED_TS };
}

function orderId(n: number): string {
  return `01920000-0000-7000-8000-${String(n).padStart(12, "0")}`;
}

function makeOrder(
  id: string,
  occurredAt: string,
  collectedCents: number,
  status: "paid" | "incomplete" | "partial" | "refunded" = "paid",
) {
  return {
    id,
    source: "clover" as const,
    cloverMerchantId: "merchant-1",
    cloverOrderId: id,
    cloverIdempotencyKey: `${id}:seed`,
    status,
    occurredAt: new Date(occurredAt),
    modifiedAt: new Date(occurredAt),
    subtotalCents: BigInt(collectedCents),
    taxCents: BigInt(0),
    discountCents: BigInt(0),
    totalCents: BigInt(collectedCents),
    collectedCents: BigInt(collectedCents),
    ...timestamps(),
  };
}

function makeLineItem(
  orderIdValue: string,
  name: string,
  grossAmountCents: number,
  cloverItemId: string,
) {
  return {
    orderId: orderIdValue,
    cloverItemId,
    name,
    quantity: BigInt(1),
    grossAmountCents: BigInt(grossAmountCents),
    discountAmountCents: BigInt(0),
    netAmountCents: BigInt(grossAmountCents),
    collectedAmountCents: BigInt(grossAmountCents),
    refunded: false,
    ...timestamps(),
  };
}

function makeVendorItem(
  vendorId: string,
  cloverItemId: string,
  name: string,
  priceCents: number,
) {
  return {
    vendorId,
    cloverItemId,
    name,
    priceCents: BigInt(priceCents),
    ...timestamps(),
  };
}
