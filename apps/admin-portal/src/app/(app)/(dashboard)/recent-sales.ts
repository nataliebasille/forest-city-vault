import {
  BOOTSTRAP_STORE_ID,
  SapphoQueryable,
} from "@forest-city-vault/infrastructure-database";
import {
  sales,
  salesLineItems,
  stores,
  vendorItems,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

/** How many recent sales the dashboard preview lists, newest first. */
export const RECENT_SALES_LIMIT = 10;

/**
 * A single line item within a {@link RecentSale}. `amountCents` is the item's
 * gross amount in whole cents; `vendorName` is the linked vendor's name, or
 * `null` when the item has no vendor. Formatting (cents → USD, the vendor
 * fallback) is the view layer's job, not this read model's.
 */
export type RecentSaleItem = {
  readonly name: string;
  readonly vendorName: string | null;
  readonly amountCents: number;
};

/**
 * One row of the dashboard's "Recent sales" preview. Money is in whole cents and
 * `occurredAt` is a real {@link Date}; formatting (cents → USD, the local time
 * string, the item summary) is the view layer's job, not this read model's.
 * `items` is every line item on the sale, ordered lead-first (highest gross
 * amount), from which the view derives both its "… + N more" summary and the
 * per-item hover breakdown.
 *
 * `timeZone` is the store's IANA zone, carried on every row so the view can
 * render each sale's time in the store's local zone without a second read.
 */
export type RecentSale = {
  readonly id: string;
  readonly occurredAt: Date;
  readonly totalCents: number;
  readonly timeZone: string;
  readonly items: readonly RecentSaleItem[];
};

/**
 * Reads the store's most recent sales for the dashboard preview in a single
 * database round-trip: the newest {@link RECENT_SALES_LIMIT} sales ordered by
 * `occurredAt` (ties broken by id for a stable order).
 *
 * Each sale's line items are folded in by left-joining them (and their vendors,
 * resolved through `vendor_items` on `clover_item_id`) and aggregating into a
 * single `items` JSON array per sale, ordered lead-first by gross amount (ties
 * broken by name). A sale with no line items yields an empty array. Building the
 * array in one `json_agg` keeps each item's name, vendor, and amount aligned.
 * The store's time zone is folded in as a scalar subquery so the view can
 * localize each `occurredAt` without another query.
 */
export const recentSales = Effect.gen(function* () {
  const queryable = yield* SapphoQueryable;

  const rows = yield* queryable.query((db) =>
    db
      .select({
        id: sales.id,
        occurredAt: sales.occurredAt,
        totalCents: sales.totalCents,
        timeZone:
          sql<string>`(select ${stores}."time_zone" from ${stores} where ${stores}."id" = ${BOOTSTRAP_STORE_ID})`.as(
            "time_zone",
          ),
        items:
          sql<unknown>`coalesce(json_agg(json_build_object('name', ${salesLineItems}."name", 'vendorName', ${vendors}."name", 'amountCents', ${salesLineItems}."gross_amount_cents") order by ${salesLineItems}."gross_amount_cents" desc, ${salesLineItems}."name" asc) filter (where ${salesLineItems}."id" is not null), '[]'::json)`.as(
            "items",
          ),
      })
      .from(sales)
      .leftJoin(salesLineItems, eq(salesLineItems.saleId, sales.id))
      .leftJoin(
        vendorItems,
        eq(vendorItems.cloverItemId, salesLineItems.cloverItemId),
      )
      .leftJoin(vendors, eq(vendors.id, vendorItems.vendorId))
      .groupBy(sales.id)
      .orderBy(desc(sales.occurredAt), asc(sales.id))
      .limit(RECENT_SALES_LIMIT),
  );

  return yield* decodeRows(rows);
});

// pg/pglite hand back count()/sum() (bigint & numeric) as strings — and, for
// some drivers, as bigint — so counts and cents tolerate number, string, or
// bigint before landing as a plain number.
const NumericValue = Schema.transform(
  Schema.Union(Schema.Number, Schema.String, Schema.BigIntFromSelf),
  Schema.Number,
  { strict: false, decode: (value) => Number(value), encode: (value) => value },
);

const RecentSaleItemRow = Schema.Struct({
  name: Schema.String,
  vendorName: Schema.NullOr(Schema.String),
  amountCents: NumericValue,
});

// Drivers hand a `json` column back either already parsed (an array of objects,
// as node-postgres and pglite both do here) or, in some setups, as a raw JSON
// string; normalize a string before decoding the item list.
const ItemsValue = Schema.transform(
  Schema.Unknown,
  Schema.Array(RecentSaleItemRow),
  {
    strict: false,
    decode: (value) => (typeof value === "string" ? JSON.parse(value) : value),
    encode: (value) => value,
  },
);

const RecentSaleRow = Schema.Struct({
  id: Schema.String,
  occurredAt: Schema.ValidDateFromSelf,
  totalCents: NumericValue,
  timeZone: Schema.String,
  items: ItemsValue,
});

const decodeRows = Schema.decodeUnknown(Schema.Array(RecentSaleRow));
