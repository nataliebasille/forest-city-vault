import { SapphoQueryable } from "@forest-city-vault/infrastructure-database";
import {
  vendorItems,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { asc, eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

/** One item belonging to a {@link VendorListRow}; money is in whole cents. */
export type VendorListItem = {
  readonly cloverItemId: string;
  readonly name: string;
  readonly priceCents: number;
};

/**
 * One vendor row for the vendor management page. `items` are the vendor's
 * Clover-mirrored items (empty when none). Formatting is the view layer's job,
 * not this read model's.
 */
export type VendorListRow = {
  readonly id: string;
  readonly name: string;
  readonly status: "active" | "inactive";
  readonly cloverCategoryId: string | null;
  readonly updatedAt: Date;
  readonly items: readonly VendorListItem[];
};

/**
 * Reads every vendor plus its items in a single round-trip: left-joins
 * `fcv_vendor_items` and folds each vendor's items into one `json_agg` array,
 * ordered by Clover item id (a vendor with no items yields `[]`). Vendors are
 * ordered by name. `price_cents` is cast to text inside the JSON so the bigint
 * column mapper never sees the NULL a left join produces for an item-less vendor.
 */
export const vendorsList = Effect.gen(function* () {
  const queryable = yield* SapphoQueryable;

  const rows = yield* queryable.query((db) =>
    db
      .select({
        id: vendors.id,
        name: vendors.name,
        status: vendors.status,
        cloverCategoryId: vendors.cloverCategoryId,
        updatedAt: vendors.updatedAt,
        items:
          sql<unknown>`coalesce(json_agg(json_build_object('cloverItemId', ${vendorItems}."clover_item_id", 'name', ${vendorItems}."name", 'priceCents', ${vendorItems}."price_cents"::text) order by ${vendorItems}."clover_item_id") filter (where ${vendorItems}."id" is not null), '[]'::json)`.as(
            "items",
          ),
      })
      .from(vendors)
      .leftJoin(vendorItems, eq(vendorItems.vendorId, vendors.id))
      .groupBy(vendors.id)
      .orderBy(asc(vendors.name)),
  );

  return yield* decodeRows(rows);
});

// pg/pglite hand back numeric/bigint columns as strings — and, for some drivers,
// as bigint — so cents tolerate number, string, or bigint before landing as a
// plain number.
const NumericValue = Schema.transform(
  Schema.Union(Schema.Number, Schema.String, Schema.BigIntFromSelf),
  Schema.Number,
  { strict: false, decode: (value) => Number(value), encode: (value) => value },
);

const VendorItemRow = Schema.Struct({
  cloverItemId: Schema.String,
  name: Schema.String,
  priceCents: NumericValue,
});

// A `json` column can come back already parsed or as a raw JSON string depending
// on the driver; normalize a string before decoding the item list.
const ItemsValue = Schema.transform(
  Schema.Unknown,
  Schema.Array(VendorItemRow),
  {
    strict: false,
    decode: (value) => (typeof value === "string" ? JSON.parse(value) : value),
    encode: (value) => value,
  },
);

const VendorRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  status: Schema.Literal("active", "inactive"),
  cloverCategoryId: Schema.NullOr(Schema.String),
  updatedAt: Schema.ValidDateFromSelf,
  items: ItemsValue,
});

const decodeRows = Schema.decodeUnknown(Schema.Array(VendorRow));
