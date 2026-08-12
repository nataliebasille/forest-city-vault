import { now } from "@forest-city-vault/core-clock";
import {
  BOOTSTRAP_STORE_ID,
  SapphoQueryable,
} from "@forest-city-vault/infrastructure-database";
import {
  orderLineItems,
  orders,
  stores,
  vendorItems,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

/** How many vendors the sales-review page's top-vendors list shows. */
export const TOP_VENDORS_LIMIT = 5;

/** One vendor's gross contribution to the current month, for the top-vendors list. */
export type VendorRollup = {
  readonly name: string;
  readonly grossCents: number;
};

/**
 * Reads the current month's top vendors by gross, in a single database
 * round-trip: joins each order's line items to their vendor, sums collected by
 * vendor, and keeps only the top {@link TOP_VENDORS_LIMIT}.
 *
 * "Month to date" is anchored to the store's own time zone via the same
 * `bounds` shape `salesReviewMetrics` uses, and only captured (`paid`) orders
 * count. A line item's vendor is resolved by joining `vendor_items` on
 * `clover_item_id`; items whose Clover item has no matching vendor record
 * (custom items, or items not yet synced) have nothing to name, so the inner
 * join drops them rather than the rollup guessing a label.
 */
export const salesReviewVendors = Effect.gen(function* () {
  const queryable = yield* SapphoQueryable;
  const at = yield* now;

  const rows = yield* queryable.query((db) => {
    const bounds = db.$with("bounds").as(
      db
        .select({
          zone: sql`${stores.timeZone}`.as("zone"),
          monthStart:
            sql`date_trunc('month', ${at}::timestamptz at time zone ${stores.timeZone})`.as(
              "month_start",
            ),
          dayStart:
            sql`date_trunc('day', ${at}::timestamptz at time zone ${stores.timeZone})`.as(
              "day_start",
            ),
        })
        .from(stores)
        .where(eq(stores.id, BOOTSTRAP_STORE_ID)),
    );

    return db
      .with(bounds)
      .select({
        name: vendors.name,
        grossCents: sql<string>`sum(${orderLineItems.collectedAmountCents})`.as(
          "gross_cents",
        ),
      })
      .from(orderLineItems)
      .innerJoin(orders, eq(orders.id, orderLineItems.orderId))
      .innerJoin(
        vendorItems,
        eq(vendorItems.cloverItemId, orderLineItems.cloverItemId),
      )
      .innerJoin(vendors, eq(vendors.id, vendorItems.vendorId))
      .innerJoin(bounds, sql`true`)
      .where(
        sql`${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.month_start and ${orders.occurredAt} at time zone bounds.zone < bounds.day_start + interval '1 day'`,
      )
      .groupBy(vendors.id, vendors.name)
      .orderBy(sql`sum(${orderLineItems.collectedAmountCents}) desc`)
      .limit(TOP_VENDORS_LIMIT);
  });

  return yield* decodeVendors(rows);
});

// pg/pglite hand back sum() (numeric) as a string — and, for some drivers, as
// bigint — so it tolerates number, string, or bigint before landing as a
// plain number.
const NumericValue = Schema.transform(
  Schema.Union(Schema.Number, Schema.String, Schema.BigIntFromSelf),
  Schema.Number,
  { strict: false, decode: (value) => Number(value), encode: (value) => value },
);

const VendorRow = Schema.Struct({
  name: Schema.String,
  grossCents: NumericValue,
});

const decodeVendors = Schema.decodeUnknown(Schema.Array(VendorRow));
