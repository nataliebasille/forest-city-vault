import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { QueryableLive } from "@forest-city-vault/infrastructure-database";
import {
  vendorItems,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect } from "effect";
import { loadVendorData } from "./build-vendors";

const SEED_TS = new Date("2024-05-01T00:00:00.000Z");

type TestContext = Awaited<ReturnType<typeof makeDatabaseTestContext>>;
type Db = TestContext["db"];

function runLoad(layer: TestContext["layer"]) {
  return Effect.runPromise(
    loadVendorData.pipe(Effect.provide(QueryableLive), Effect.provide(layer)),
  );
}

function timestamps() {
  return { createdAt: SEED_TS, updatedAt: SEED_TS };
}

async function seedVendor(
  db: Db,
  name: string,
  status: "active" | "inactive" = "active",
) {
  const [row] = await db
    .insert(vendors)
    .values({ name, status, ...timestamps() })
    .returning({ id: vendors.id });
  return row!.id;
}

async function seedItem(
  db: Db,
  vendorId: string,
  cloverItemId: string,
  name: string,
  priceCents: number,
) {
  await db.insert(vendorItems).values({
    vendorId,
    cloverItemId,
    name,
    priceCents: BigInt(priceCents),
    ...timestamps(),
  });
}

describe("loadVendorData", () => {
  test("maps active vendors and their items into VendorData", async () => {
    const { layer, db } = await makeDatabaseTestContext();

    const vendorId = await seedVendor(db, "Maple & Co.");
    await seedItem(db, vendorId, "ITEM1", "Syrup", 1200);
    await seedItem(db, vendorId, "ITEM2", "Candle", 800);

    const data = await runLoad(layer);

    assert.equal(data.source, "database");
    assert.equal(data.count, 1);

    const [vendor] = data.vendors;
    assert.equal(vendor!.name, "Maple & Co.");
    assert.equal(vendor!.slug, "maple-co");
    assert.equal(vendor!.itemCount, 2);
    // Prices are converted from cents to dollars.
    assert.deepEqual(vendor!.priceRange, { min: 8, max: 12 });
    // Products carry the Clover item id and are ordered by item name.
    assert.deepEqual(vendor!.products, [
      { id: "ITEM2", name: "Candle", price: 8 },
      { id: "ITEM1", name: "Syrup", price: 12 },
    ]);
    // searchKey combines the vendor name and item names, normalized.
    assert.equal(vendor!.searchKey.includes("maple"), true);
    assert.equal(vendor!.searchKey.includes("syrup"), true);
    assert.equal(vendor!.searchKey.includes("candle"), true);
  });

  test("excludes inactive vendors", async () => {
    const { layer, db } = await makeDatabaseTestContext();

    const activeId = await seedVendor(db, "Active Vendor", "active");
    await seedItem(db, activeId, "A1", "Active Item", 500);

    const inactiveId = await seedVendor(db, "Hidden Vendor", "inactive");
    await seedItem(db, inactiveId, "H1", "Hidden Item", 500);

    const data = await runLoad(layer);

    assert.deepEqual(
      data.vendors.map((vendor) => vendor.name),
      ["Active Vendor"],
    );
  });

  test("excludes active vendors that have no items", async () => {
    const { layer, db } = await makeDatabaseTestContext();

    const withItems = await seedVendor(db, "Has Items");
    await seedItem(db, withItems, "I1", "Thing", 300);

    await seedVendor(db, "No Items");

    const data = await runLoad(layer);

    assert.deepEqual(
      data.vendors.map((vendor) => vendor.name),
      ["Has Items"],
    );
  });

  test("sorts vendors alphabetically by name", async () => {
    const { layer, db } = await makeDatabaseTestContext();

    for (const name of ["Zebra Goods", "Acorn Studio", "Maple & Co."]) {
      const id = await seedVendor(db, name);
      await seedItem(db, id, `${name}-1`, `${name} item`, 1000);
    }

    const data = await runLoad(layer);

    assert.deepEqual(
      data.vendors.map((vendor) => vendor.name),
      ["Acorn Studio", "Maple & Co.", "Zebra Goods"],
    );
  });

  test("keeps every SKU that shares a display name, each with its own id", async () => {
    const { layer, db } = await makeDatabaseTestContext();

    const vendorId = await seedVendor(db, "Purlygirl Knits");
    await seedItem(db, vendorId, "CHICK1", "Baby Chick", 1500);
    await seedItem(db, vendorId, "CHICK2", "Baby Chick", 1800);

    const data = await runLoad(layer);

    const [vendor] = data.vendors;
    assert.equal(vendor!.itemCount, 2);
    // Both same-named SKUs survive as distinct products, each keyed by its id.
    assert.deepEqual(vendor!.products, [
      { id: "CHICK1", name: "Baby Chick", price: 15 },
      { id: "CHICK2", name: "Baby Chick", price: 18 },
    ]);
    // The unique-name lists used for search still collapse the duplicate.
    assert.deepEqual(vendor!.items, ["Baby Chick"]);
  });
});
