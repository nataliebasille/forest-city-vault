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
import { salesReviewDaily } from "./sales-review-daily";

// 2024-06-08 12:00 in America/Detroit (EDT, UTC-4) — day 8 of the month.
const NOW = new Date("2024-06-08T16:00:00.000Z");
const SEED_TS = new Date("2024-05-01T00:00:00.000Z");

type TestContext = Awaited<ReturnType<typeof makeDatabaseTestContext>>;
type Db = TestContext["db"];

function runDaily(layer: TestContext["layer"]) {
  return Effect.runPromise(
    salesReviewDaily.pipe(
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

describe("salesReviewDaily", () => {
  test("zero-fills every day 1..today, summing sales that land on the same day", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    await db.insert(orders).values([
      // Two sales on June 3 (day 3) — should sum into one entry.
      makeOrder("2024-06-03T14:00:00.000Z", 1500), // 10:00 local
      makeOrder("2024-06-03T17:00:00.000Z", 700), // 13:00 local
      // One sale on June 8 (day 8, today).
      makeOrder("2024-06-08T14:00:00.000Z", 1200),
      // A rejected payment on June 3 — excluded from the day's gross.
      makeOrder("2024-06-03T18:00:00.000Z", 9999, "refunded"),
      // After the cutoff — excluded.
      makeOrder("2024-06-10T12:00:00.000Z", 9999),
    ]);

    const daily = await runDaily(layer);

    assert.deepEqual(daily, [
      { day: 1, grossCents: 0 },
      { day: 2, grossCents: 0 },
      { day: 3, grossCents: 2200 },
      { day: 4, grossCents: 0 },
      { day: 5, grossCents: 0 },
      { day: 6, grossCents: 0 },
      { day: 7, grossCents: 0 },
      { day: 8, grossCents: 1200 },
    ]);
  });

  test("returns all-zero days for a store with no sales", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const daily = await runDaily(layer);

    assert.equal(daily.length, 8);
    assert.ok(daily.every((entry) => entry.grossCents === 0));
    assert.deepEqual(
      daily.map((entry) => entry.day),
      [1, 2, 3, 4, 5, 6, 7, 8],
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
