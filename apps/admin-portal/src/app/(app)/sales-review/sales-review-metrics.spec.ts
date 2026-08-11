import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { staticClock } from "@forest-city-vault/core-clock";
import { QueryableLive } from "@forest-city-vault/infrastructure-database";
import {
  sales,
  stores,
} from "@forest-city-vault/infrastructure-database/schema";
import { BOOTSTRAP_STORE_ID } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect } from "effect";
import { salesReviewMetrics } from "./sales-review-metrics";

// 2024-06-08 12:00 in America/Detroit (EDT, UTC-4) — day 8 of the month, so the
// pace window compares against days 1–8 of May.
const NOW = new Date("2024-06-08T16:00:00.000Z");
const SEED_TS = new Date("2024-05-01T00:00:00.000Z");

type TestContext = Awaited<ReturnType<typeof makeDatabaseTestContext>>;
type Db = TestContext["db"];

function runMetrics(layer: TestContext["layer"]) {
  return Effect.runPromise(
    salesReviewMetrics.pipe(
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

describe("salesReviewMetrics", () => {
  test("computes month-to-date totals and the previous month's same-day pace window", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    await db.insert(sales).values([
      // Month to date (June 1–8 local).
      makeSale("2024-06-08T14:00:00.000Z", BigInt(1500)), // June 8, 10:00 local
      makeSale("2024-06-03T13:00:00.000Z", BigInt(700)), // June 3, 09:00 local
      // Month to date, with a $2 discount — proves net = gross - discount.
      makeSale("2024-06-04T13:00:00.000Z", BigInt(1000), {
        discountCents: BigInt(200),
      }),
      // Month to date, but not captured — excluded from every figure.
      makeSale("2024-06-05T13:00:00.000Z", BigInt(4200), {
        paymentStatus: "rejected",
      }),
      // After the month-to-date cutoff — excluded.
      makeSale("2024-06-10T12:00:00.000Z", BigInt(9999)),
      // Previous month, within the same 8-day window (May 1–8 local) —
      // included in the pace figure.
      makeSale("2024-05-08T14:00:00.000Z", BigInt(1200)), // May 8, 10:00 local
      // Previous month, day 9 — outside the pace window, excluded.
      makeSale("2024-05-09T14:00:00.000Z", BigInt(5000)),
      // Well before the pace window — excluded.
      makeSale("2024-05-20T12:00:00.000Z", BigInt(9999)),
    ]);

    const metrics = await runMetrics(layer);

    assert.deepEqual(metrics, {
      monthToDateSaleCount: 3,
      monthToDateGrossCents: 3200,
      monthToDateNetCents: 3000,
      previousMonthPaceGrossCents: 1200,
      monthStartYear: 2024,
      monthStartMonth: 6,
    });
  });

  test("returns zeros for a store with no sales", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const metrics = await runMetrics(layer);

    assert.deepEqual(metrics, {
      monthToDateSaleCount: 0,
      monthToDateGrossCents: 0,
      monthToDateNetCents: 0,
      previousMonthPaceGrossCents: 0,
      monthStartYear: 2024,
      monthStartMonth: 6,
    });
  });

  test("clamps the previous-month pace window when today's day-of-month exceeds the previous month's length", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    // Today is May 31 (day 31) in America/Detroit — April only has 30 days,
    // so naively adding 31 days to April 1 would spill into May 1 and
    // double-count it as both month-to-date and "previous month" pace.
    const may31 = new Date("2024-05-31T16:00:00.000Z");

    await db.insert(sales).values([
      // May 1 — squarely in the current month (May), not April.
      makeSale("2024-05-01T14:00:00.000Z", BigInt(100000)),
      // April 30 — the last day of the previous month, should still count.
      makeSale("2024-04-30T14:00:00.000Z", BigInt(1000)),
    ]);

    const metrics = await Effect.runPromise(
      salesReviewMetrics.pipe(
        Effect.provide(QueryableLive),
        Effect.provide(layer),
        Effect.provide(staticClock(may31)),
      ),
    );

    assert.equal(metrics.monthToDateGrossCents, 100000);
    assert.equal(metrics.previousMonthPaceGrossCents, 1000);
  });
});

function makeSale(
  occurredAt: string,
  totalCents: bigint,
  options: {
    paymentStatus?: "paid" | "rejected" | "incomplete";
    discountCents?: bigint;
  } = {},
) {
  const { paymentStatus = "paid", discountCents = BigInt(0) } = options;
  return {
    source: "clover" as const,
    paymentStatus,
    occurredAt: new Date(occurredAt),
    subtotalCents: totalCents,
    taxCents: BigInt(0),
    discountCents,
    totalCents,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  };
}
