import {
  BOOTSTRAP_STORE_ID,
  SapphoQueryable,
} from "@forest-city-vault/infrastructure-database";
import {
  sales,
  salesLineItems,
  stores,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

/** How many recent sales the dashboard preview lists, newest first. */
export const RECENT_SALES_LIMIT = 10;

/**
 * One row of the dashboard's "Recent sales" preview. Money is in whole cents and
 * `occurredAt` is a real {@link Date}; formatting (cents → USD, the local time
 * string, the item summary, the vendor label) is the view layer's job, not this
 * read model's. `leadItemName`/`itemCount`/`vendorNames` are the raw facts the
 * view derives its "… + N more" and "Multiple vendors" columns from.
 *
 * `timeZone` is the store's IANA zone, carried on every row so the view can
 * render each sale's time in the store's local zone without a second read.
 */
export type RecentSale = {
  readonly id: string;
  readonly occurredAt: Date;
  readonly totalCents: number;
  readonly timeZone: string;
  readonly leadItemName: string | null;
  readonly itemCount: number;
  readonly vendorNames: readonly string[];
};

/**
 * Reads the store's most recent sales for the dashboard preview in a single
 * database round-trip: the newest {@link RECENT_SALES_LIMIT} sales ordered by
 * `occurredAt` (ties broken by id for a stable order).
 *
 * Each sale's derived columns are folded in by left-joining its line items (and
 * their vendors) and grouping by the sale: `itemCount` counts the line items,
 * `leadItemName` is the highest-value one (the sale's "headline" item, picked as
 * the first element of the line-item names ordered by gross amount), and
 * `vendorNames` collects the distinct, non-null vendor names. The store's time
 * zone is folded in as a scalar subquery so the view can localize each
 * `occurredAt` without another query.
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
        itemCount: sql<string>`count(distinct ${salesLineItems}."id")`.as(
          "item_count",
        ),
        leadItemName: sql<
          string | null
        >`(array_agg(${salesLineItems}."name" order by ${salesLineItems}."gross_amount_cents" desc, ${salesLineItems}."name" asc))[1]`.as(
          "lead_item_name",
        ),
        vendorNames: sql<
          string[]
        >`coalesce(array_agg(distinct ${vendors}."name" order by ${vendors}."name") filter (where ${vendors}."name" is not null), array[]::text[])`.as(
          "vendor_names",
        ),
      })
      .from(sales)
      .leftJoin(salesLineItems, eq(salesLineItems.saleId, sales.id))
      .leftJoin(vendors, eq(vendors.id, salesLineItems.vendorId))
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

const RecentSaleRow = Schema.Struct({
  id: Schema.String,
  occurredAt: Schema.ValidDateFromSelf,
  totalCents: NumericValue,
  timeZone: Schema.String,
  leadItemName: Schema.NullOr(Schema.String),
  itemCount: NumericValue,
  vendorNames: Schema.Array(Schema.String),
});

const decodeRows = Schema.decodeUnknown(Schema.Array(RecentSaleRow));
