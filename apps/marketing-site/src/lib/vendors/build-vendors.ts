import {
  DatabaseLive,
  QueryableLive,
  SapphoQueryable,
} from "@forest-city-vault/infrastructure-database";
import {
  vendorItems,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { eq, sql } from "drizzle-orm";
import { Data, Effect, Layer } from "effect";
import { buildSearchKey, slugify } from "./normalize";
import type { PriceRange, Vendor, VendorData } from "./types";

const SOURCE = "database";
const MAX_SAMPLE_ITEMS = 5;
const CENTS_PER_DOLLAR = 100;

/** Raised when the vendor catalog cannot be read from the database. */
export class VendorDataError extends Data.TaggedError("VendorDataError")<{
  readonly cause: unknown;
}> {}

/** A vendor's item as read from the database, with price already in dollars. */
type RawItem = {
  cloverItemId: string;
  name: string;
  price: number;
};

/**
 * Fetch every active vendor with its items and fold them into {@link VendorData}.
 *
 * Requires {@link SapphoQueryable} so it can be exercised in tests against an
 * in-memory database; `buildVendorData` provides the concrete layer. The join
 * mirrors the vendor repository's `loadVendorWithItems`:
 *  - The item's `name` is aliased to `item_name` so it does not collide with the
 *    vendor's `name` column, which the effect-sql/drizzle driver maps by name.
 *  - `price_cents` is cast to text so drizzle's `bigint` mapper is not applied to
 *    the NULL a left join produces for a vendor with no items (that mapper would
 *    otherwise throw "Cannot convert undefined to a BigInt").
 */
export const loadVendorData = Effect.gen(function* () {
  const queryable = yield* SapphoQueryable;

  const rows = yield* queryable.query((db) =>
    db
      .select({
        vendorId: vendors.id,
        vendorName: vendors.name,
        itemCloverItemId: vendorItems.cloverItemId,
        itemName: sql<string | null>`${vendorItems}."name"`.as("item_name"),
        itemPriceCents: sql<
          string | null
        >`${vendorItems}."price_cents"::text`.as("item_price_cents"),
      })
      .from(vendors)
      .leftJoin(vendorItems, eq(vendorItems.vendorId, vendors.id))
      .where(eq(vendors.status, "active"))
      .orderBy(vendors.name, vendorItems.name, vendorItems.cloverItemId),
  );

  const byVendor = new Map<string, { name: string; items: RawItem[] }>();
  for (const row of rows) {
    const entry = byVendor.get(row.vendorId) ?? {
      name: row.vendorName,
      items: [],
    };
    if (!byVendor.has(row.vendorId)) {
      byVendor.set(row.vendorId, entry);
    }
    if (row.itemCloverItemId !== null) {
      entry.items.push({
        cloverItemId: row.itemCloverItemId,
        name: row.itemName ?? "",
        price: Number(row.itemPriceCents) / CENTS_PER_DOLLAR,
      });
    }
  }

  const vendorList = [...byVendor.values()]
    // Only surface vendors that actually have items to show.
    .filter((entry) => entry.items.length > 0)
    .map((entry) => toVendor(entry.name, entry.items))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    count: vendorList.length,
    vendors: vendorList,
  } satisfies VendorData;
});

/**
 * Build the full {@link VendorData} from the database.
 *
 * Provides the read-only query layer ({@link QueryableLive} over
 * {@link DatabaseLive}) itself, so it requires no services (`R = never`) and
 * callers can execute it with a plain `Effect.runPromise` — see the cached
 * loader in `data.ts`. Any failure (config, connection, or query) surfaces as a
 * typed {@link VendorDataError} on the error channel.
 */
export const buildVendorData: Effect.Effect<VendorData, VendorDataError> =
  loadVendorData.pipe(
    Effect.provide(QueryableLive.pipe(Layer.provide(DatabaseLive))),
    Effect.mapError((cause) => new VendorDataError({ cause })),
  );

function toVendor(name: string, items: RawItem[]): Vendor {
  const prices = items.map((item) => item.price).filter((price) => price > 0);

  const priceRange: PriceRange | null =
    prices.length > 0 ?
      {
        min: Math.min(...prices),
        max: Math.max(...prices),
      }
    : null;

  const itemNames = items.map((item) => item.name);
  const uniqueItemNames = [...new Set(itemNames)];

  return {
    name,
    slug: slugify(name),
    searchKey: buildSearchKey([name, ...itemNames]),
    itemCount: items.length,
    priceRange,
    sampleItems: uniqueItemNames.slice(0, MAX_SAMPLE_ITEMS),
    items: uniqueItemNames,
    products: items.map((item) => ({
      id: item.cloverItemId,
      name: item.name,
      price: item.price,
    })),
  };
}
