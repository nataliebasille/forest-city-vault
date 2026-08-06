import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bootstrapStore,
  QueryableLive,
  runBootstrap,
  seedSales,
} from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect } from "effect";
import { recentSales } from "./recent-sales";

// The instant the seed's `hoursAgo` offsets are measured back from.
const NOW = new Date("2024-06-01T12:00:00.000Z");

describe("recentSales with domain-seeded sales", () => {
  test("reflects sales recorded through the Sales aggregate, newest first", async () => {
    const { layer } = await makeDatabaseTestContext();

    // Seed the store and the demo sales through the same domain aggregates and
    // saga-scoped repositories the bootstrap and seed scripts use.
    await Effect.runPromise(
      runBootstrap(bootstrapStore(), layer).pipe(Effect.orDie),
    );
    await Effect.runPromise(
      runBootstrap(seedSales({ now: NOW }), layer).pipe(Effect.orDie),
    );

    const result = await Effect.runPromise(
      recentSales.pipe(Effect.provide(QueryableLive), Effect.provide(layer)),
    );

    // The five default seed sales, newest first (1h, 3h, 6h, 30h, 54h ago). The
    // seed leaves every line item's vendor unset, so vendorNames is empty; the
    // lead item is the highest-gross line item in each sale.
    assert.deepEqual(
      result.map((sale) => ({
        occurredAt: sale.occurredAt.toISOString(),
        totalCents: sale.totalCents,
        timeZone: sale.timeZone,
        leadItemName: sale.leadItemName,
        itemCount: sale.itemCount,
        vendorNames: sale.vendorNames,
      })),
      [
        {
          occurredAt: "2024-06-01T11:00:00.000Z",
          totalCents: 2499,
          timeZone: "America/Detroit",
          leadItemName: "Vintage denim jacket",
          itemCount: 1,
          vendorNames: [],
        },
        {
          occurredAt: "2024-06-01T09:00:00.000Z",
          totalCents: 2050,
          timeZone: "America/Detroit",
          leadItemName: "Ceramic mug",
          itemCount: 2,
          vendorNames: [],
        },
        {
          occurredAt: "2024-06-01T06:00:00.000Z",
          totalCents: 4500,
          timeZone: "America/Detroit",
          leadItemName: "Hand-thrown vase",
          itemCount: 1,
          vendorNames: [],
        },
        {
          occurredAt: "2024-05-31T06:00:00.000Z",
          totalCents: 3375,
          timeZone: "America/Detroit",
          leadItemName: "Wool throw blanket",
          itemCount: 1,
          vendorNames: [],
        },
        {
          occurredAt: "2024-05-30T06:00:00.000Z",
          totalCents: 3499,
          timeZone: "America/Detroit",
          leadItemName: "Fountain pen",
          itemCount: 2,
          vendorNames: [],
        },
      ],
    );
  });
});
