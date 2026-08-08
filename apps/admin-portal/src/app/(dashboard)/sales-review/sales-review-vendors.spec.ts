import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { staticClock } from "@forest-city-vault/core-clock";
import { QueryableLive } from "@forest-city-vault/infrastructure-database";
import {
  sales,
  salesLineItems,
  stores,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { BOOTSTRAP_STORE_ID } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect } from "effect";
import { salesReviewVendors } from "./sales-review-vendors";

// 2024-06-08 12:00 in America/Detroit (EDT, UTC-4) — day 8 of the month.
const NOW = new Date("2024-06-08T16:00:00.000Z");
const SEED_TS = new Date("2024-05-01T00:00:00.000Z");

type TestContext = Awaited<ReturnType<typeof makeDatabaseTestContext>>;
type Db = TestContext["db"];

function runVendors(layer: TestContext["layer"]) {
  return Effect.runPromise(
    salesReviewVendors.pipe(
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

describe("salesReviewVendors", () => {
  test("ranks vendors by month-to-date gross, keeping only the top 5", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const vendorIds = await db
      .insert(vendors)
      .values(
        ["A", "B", "C", "D", "E", "F"].map((label) => ({
          name: `Vendor ${label}`,
          ...timestamps(),
        })),
      )
      .returning({ id: vendors.id, name: vendors.name });

    const grossByVendor: Record<string, number> = {
      "Vendor A": 5000,
      "Vendor B": 4000,
      "Vendor C": 3000,
      "Vendor D": 2000,
      "Vendor E": 1000,
      "Vendor F": 500,
    };

    for (const [index, vendor] of vendorIds.entries()) {
      const saleId = await insertSale(db, "2024-06-05T14:00:00.000Z", index);
      await db
        .insert(salesLineItems)
        .values(
          makeLineItem(
            saleId,
            `${vendor.name} item`,
            grossByVendor[vendor.name] ?? 0,
            vendor.id,
          ),
        );
    }

    const result = await runVendors(layer);

    assert.deepEqual(result, [
      { name: "Vendor A", grossCents: 5000 },
      { name: "Vendor B", grossCents: 4000 },
      { name: "Vendor C", grossCents: 3000 },
      { name: "Vendor D", grossCents: 2000 },
      { name: "Vendor E", grossCents: 1000 },
    ]);
  });

  test("excludes line items outside the current month-to-date window", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const [vendor] = await db
      .insert(vendors)
      .values({ name: "Late Vendor", ...timestamps() })
      .returning({ id: vendors.id });

    // Before this month entirely — should not appear at all.
    const oldSaleId = await insertSale(db, "2024-05-20T12:00:00.000Z", 1);
    await db
      .insert(salesLineItems)
      .values(makeLineItem(oldSaleId, "Old item", 9999, vendor!.id));

    const result = await runVendors(layer);

    assert.deepEqual(result, []);
  });

  test("excludes line items with no linked vendor", async () => {
    const { layer, db } = await makeDatabaseTestContext();
    await seedStore(db);

    const saleId = await insertSale(db, "2024-06-05T14:00:00.000Z", 2);
    await db
      .insert(salesLineItems)
      .values(makeLineItem(saleId, "Custom item", 9999, null));

    const result = await runVendors(layer);

    assert.deepEqual(result, []);
  });
});

function timestamps() {
  return { createdAt: SEED_TS, updatedAt: SEED_TS };
}

function saleId(n: number): string {
  return `01920000-0000-7000-8000-${String(n).padStart(12, "0")}`;
}

async function insertSale(
  db: Db,
  occurredAt: string,
  n: number,
): Promise<string> {
  const id = saleId(n + 1000);
  await db.insert(sales).values({
    id,
    source: "clover" as const,
    occurredAt: new Date(occurredAt),
    subtotalCents: BigInt(0),
    taxCents: BigInt(0),
    discountCents: BigInt(0),
    totalCents: BigInt(0),
    ...timestamps(),
  });
  return id;
}

function makeLineItem(
  saleIdValue: string,
  name: string,
  grossAmountCents: number,
  vendorId: string | null,
) {
  return {
    saleId: saleIdValue,
    vendorId,
    name,
    quantity: BigInt(1),
    grossAmountCents: BigInt(grossAmountCents),
    discountAmountCents: BigInt(0),
    netAmountCents: BigInt(grossAmountCents),
    ...timestamps(),
  };
}
