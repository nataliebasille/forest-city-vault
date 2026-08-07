import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Effect, Layer } from "effect";
import { Clock, staticClock } from "@forest-city-vault/core-clock";
import { Vendor } from "@forest-city-vault/domain";
import { Database } from "../index";
import { RepositoriesLive } from "./index";
import { DatabaseTest } from "../testing";

const NOW = new Date("2024-01-02T03:04:05.000Z");

type RepoLive = Layer.Layer.Success<typeof RepositoriesLive>;

function runPooled<A>(
  effect: Effect.Effect<A, unknown, RepoLive | Clock | Database>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(RepositoriesLive),
      Effect.provide(staticClock(NOW)),
      Effect.provide(DatabaseTest),
    ) as Effect.Effect<A, never, never>,
  );
}

const makeVendor = (vendorId: string, name = "Maple & Co.") =>
  Effect.gen(function* () {
    const vendor = yield* Vendor.actions.create(Vendor.pristine(vendorId), {
      name,
    });
    yield* Vendor.repository.save(vendor);
    return vendor;
  });

describe("Vendor repository (pooled)", () => {
  test("saves synced items and reloads them onto the snapshot", async () => {
    const vendorId = crypto.randomUUID();

    const reloaded = await runPooled(
      Effect.gen(function* () {
        const vendor = yield* makeVendor(vendorId);
        const synced = yield* Vendor.actions.syncCloverItems(vendor, {
          items: [
            { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
            { cloverItemId: "ITEM2", name: "Candle", price: 800 },
          ],
        });
        yield* Vendor.repository.save(synced);

        return yield* Vendor.repository.getById(Vendor.pristine(vendorId).id);
      }),
    );

    assert.deepEqual([...reloaded.snapshot.items], [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);
  });

  test("replaces the persisted item set on re-sync", async () => {
    const vendorId = crypto.randomUUID();

    const reloaded = await runPooled(
      Effect.gen(function* () {
        const vendor = yield* makeVendor(vendorId);

        const first = yield* Vendor.actions.syncCloverItems(vendor, {
          items: [
            { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
            { cloverItemId: "ITEM2", name: "Candle", price: 800 },
          ],
        });
        yield* Vendor.repository.save(first);

        const reloadedFirst = yield* Vendor.repository.getById(
          Vendor.pristine(vendorId).id,
        );
        const second = yield* Vendor.actions.syncCloverItems(reloadedFirst, {
          items: [
            { cloverItemId: "ITEM1", name: "Maple Syrup", price: 1500 },
            { cloverItemId: "ITEM3", name: "Jam", price: 950 },
          ],
        });
        yield* Vendor.repository.save(second);

        return yield* Vendor.repository.getById(Vendor.pristine(vendorId).id);
      }),
    );

    assert.deepEqual([...reloaded.snapshot.items], [
      { cloverItemId: "ITEM1", name: "Maple Syrup", price: 1500 },
      { cloverItemId: "ITEM3", name: "Jam", price: 950 },
    ]);
  });

  test("reloads a vendor with no items as an empty item list", async () => {
    const vendorId = crypto.randomUUID();

    const reloaded = await runPooled(
      Effect.gen(function* () {
        yield* makeVendor(vendorId);
        return yield* Vendor.repository.getById(Vendor.pristine(vendorId).id);
      }),
    );

    assert.deepEqual([...reloaded.snapshot.items], []);
  });
});
