import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { staticClock } from "@forest-city-vault/core-clock";
import { QueryableLive } from "@forest-city-vault/infrastructure-database";
import {
  sales,
  stores,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { BOOTSTRAP_STORE_ID } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect } from "effect";
import { dashboardMetrics } from "./dashboard-metrics";

// 2024-06-01 08:00 in America/Detroit (EDT, UTC-4). Local day starts at
// 2024-06-01T04:00Z; the local week (Postgres weeks start Monday) starts on
// 2024-05-27T04:00Z.
const NOW = new Date("2024-06-01T12:00:00.000Z");
const SEED_TS = new Date("2024-05-01T00:00:00.000Z");

type TestContext = Awaited<ReturnType<typeof makeDatabaseTestContext>>;
type Db = TestContext["db"];

function runMetrics(layer: TestContext["layer"]) {
  return Effect.runPromise(
    dashboardMetrics.pipe(
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

describe("dashboardMetrics", () => {
  test("aggregates sales and vendors in the store's time zone", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    await db.insert(sales).values([
      // Today and this week (2024-06-01 06:00 local).
      makeSale("2024-06-01T10:00:00.000Z", BigInt(1500)),
      // This week but before local midnight today (2024-05-31 23:00 local) —
      // proves the day window rolls over at local, not UTC, midnight.
      makeSale("2024-06-01T03:00:00.000Z", BigInt(700)),
      // Earlier this week (Tuesday).
      makeSale("2024-05-28T12:00:00.000Z", BigInt(2500)),
      // Before this week.
      makeSale("2024-05-20T12:00:00.000Z", BigInt(9999)),
    ]);

    await db
      .insert(vendors)
      .values([makeVendor("Vendor A"), makeVendor("Vendor B")]);

    const metrics = await runMetrics(layer);

    assert.deepEqual(metrics, {
      salesToday: 1,
      revenueTodayCents: 1500,
      salesWeek: 3,
      revenueWeekCents: 4700,
      vendorCount: 2,
    });
  });

  test("returns zeros for a store with no sales, vendors, or members", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const metrics = await runMetrics(layer);

    assert.deepEqual(metrics, {
      salesToday: 0,
      revenueTodayCents: 0,
      salesWeek: 0,
      revenueWeekCents: 0,
      vendorCount: 0,
    });
  });
});

function makeSale(occurredAt: string, totalCents: bigint) {
  return {
    source: "clover" as const,
    occurredAt: new Date(occurredAt),
    subtotalCents: totalCents,
    taxCents: BigInt(0),
    discountCents: BigInt(0),
    totalCents,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  };
}

function makeVendor(name: string) {
  return { name, createdAt: SEED_TS, updatedAt: SEED_TS };
}
