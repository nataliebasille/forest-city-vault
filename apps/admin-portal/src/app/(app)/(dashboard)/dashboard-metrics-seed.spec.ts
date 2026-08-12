import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { staticClock } from "@forest-city-vault/core-clock";
import {
  bootstrapStore,
  QueryableLive,
  runBootstrap,
  seedOrders,
} from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect } from "effect";
import { dashboardMetrics } from "./dashboard-metrics";

// 2024-06-01 08:00 in America/Detroit (EDT, UTC-4). Local day starts at
// 2024-06-01T04:00Z; the local week (Monday start) starts on 2024-05-27T04:00Z.
const NOW = new Date("2024-06-01T12:00:00.000Z");

describe("dashboardMetrics with domain-seeded orders", () => {
  test("reflects orders recorded through the Order aggregate", async () => {
    const { layer } = await makeDatabaseTestContext();

    // Seed the store and the demo orders through the same domain aggregates and
    // saga-scoped repositories the bootstrap and seed scripts use.
    await Effect.runPromise(
      runBootstrap(bootstrapStore(), layer).pipe(Effect.orDie),
    );
    await Effect.runPromise(
      runBootstrap(seedOrders({ now: NOW }), layer).pipe(Effect.orDie),
    );

    const metrics = await Effect.runPromise(
      dashboardMetrics.pipe(
        Effect.provide(QueryableLive),
        Effect.provide(layer),
        Effect.provide(staticClock(NOW)),
      ),
    );

    // Three orders landed earlier today; two more earlier this week.
    assert.deepEqual(metrics, {
      salesToday: 3,
      revenueTodayCents: 9049,
      salesWeek: 5,
      revenueWeekCents: 15923,
      vendorCount: 0,
    });
  });
});
