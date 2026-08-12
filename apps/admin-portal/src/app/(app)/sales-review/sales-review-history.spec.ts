import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { staticClock } from "@forest-city-vault/core-clock";
import { QueryableLive } from "@forest-city-vault/infrastructure-database";
import {
  orders,
  stores,
} from "@forest-city-vault/infrastructure-database/schema";
import { BOOTSTRAP_STORE_ID } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect } from "effect";
import { salesReviewHistory } from "./sales-review-history";

// 2024-06-08 12:00 in America/Detroit (EDT, UTC-4).
const NOW = new Date("2024-06-08T16:00:00.000Z");
const SEED_TS = new Date("2024-05-01T00:00:00.000Z");

type TestContext = Awaited<ReturnType<typeof makeDatabaseTestContext>>;
type Db = TestContext["db"];

function runHistory(layer: TestContext["layer"]) {
  return Effect.runPromise(
    salesReviewHistory.pipe(
      Effect.provide(QueryableLive),
      Effect.provide(layer),
      Effect.provide(staticClock(NOW)),
    ),
  );
}

async function seedStore(db: Db) {
  await db.insert(stores).values({
    id: BOOTSTRAP_STORE_ID,
    name: "Forest City Vault",
    status: "active",
    timeZone: "America/Detroit",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  });
}

describe("salesReviewHistory", () => {
  test("returns 8 trailing months, newest first, zero-filled where there were no sales", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    await db.insert(orders).values([
      // Current month (June 2024): two sales.
      makeOrder("2024-06-03T14:00:00.000Z", 1500),
      makeOrder("2024-06-05T14:00:00.000Z", 700),
      // Current month, but rejected — excluded from June's gross and count.
      makeOrder("2024-06-06T14:00:00.000Z", 9999, "refunded"),
      // Two months back (April 2024): one sale.
      makeOrder("2024-04-10T14:00:00.000Z", 4200),
      // Nine months back (September 2023) — outside the trailing 8, excluded.
      makeOrder("2023-09-10T14:00:00.000Z", 9999),
    ]);

    const history = await runHistory(layer);

    assert.deepEqual(
      history.map((month) => month.key),
      [
        "2024-06",
        "2024-05",
        "2024-04",
        "2024-03",
        "2024-02",
        "2024-01",
        "2023-12",
        "2023-11",
      ],
    );

    const june = history.find((month) => month.key === "2024-06");
    assert.deepEqual(june, {
      key: "2024-06",
      year: 2024,
      month: 6,
      grossCents: 2200,
      saleCount: 2,
    });

    const april = history.find((month) => month.key === "2024-04");
    assert.deepEqual(april, {
      key: "2024-04",
      year: 2024,
      month: 4,
      grossCents: 4200,
      saleCount: 1,
    });

    const may = history.find((month) => month.key === "2024-05");
    assert.deepEqual(may, {
      key: "2024-05",
      year: 2024,
      month: 5,
      grossCents: 0,
      saleCount: 0,
    });
  });

  test("crosses a year boundary correctly", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const history = await Effect.runPromise(
      salesReviewHistory.pipe(
        Effect.provide(QueryableLive),
        Effect.provide(layer),
        Effect.provide(staticClock(new Date("2024-02-08T16:00:00.000Z"))),
      ),
    );

    assert.deepEqual(
      history.map((month) => month.key),
      [
        "2024-02",
        "2024-01",
        "2023-12",
        "2023-11",
        "2023-10",
        "2023-09",
        "2023-08",
        "2023-07",
      ],
    );
  });

  test("returns all-zero months for a store with no sales", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const history = await runHistory(layer);

    assert.equal(history.length, 8);
    assert.ok(
      history.every((month) => month.grossCents === 0 && month.saleCount === 0),
    );
  });
});

function makeOrder(
  occurredAt: string,
  collectedCents: number,
  status: "paid" | "incomplete" | "partial" | "refunded" = "paid",
) {
  return {
    id: crypto.randomUUID(),
    source: "clover" as const,
    cloverMerchantId: "merchant-1",
    cloverOrderId: crypto.randomUUID(),
    cloverIdempotencyKey: crypto.randomUUID(),
    status,
    occurredAt: new Date(occurredAt),
    modifiedAt: new Date(occurredAt),
    subtotalCents: BigInt(collectedCents),
    taxCents: BigInt(0),
    discountCents: BigInt(0),
    totalCents: BigInt(collectedCents),
    collectedCents: BigInt(collectedCents),
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  };
}
