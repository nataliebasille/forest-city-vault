import { now } from "@forest-city-vault/core-clock";
import {
  BOOTSTRAP_STORE_ID,
  SapphoQueryable,
} from "@forest-city-vault/infrastructure-database";
import {
  orders,
  stores,
  vendors,
} from "@forest-city-vault/infrastructure-database/schema";
import { eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

/**
 * The numeric snapshot behind the dashboard's metric grid. All money is in
 * whole cents and all counts are whole numbers; formatting (cents → USD, etc.)
 * is the presentation layer's job, not this read model's.
 */
export type DashboardMetrics = {
  readonly salesToday: number;
  readonly revenueTodayCents: number;
  readonly salesWeek: number;
  readonly revenueWeekCents: number;
  readonly vendorCount: number;
};

/**
 * Reads every dashboard metric in a single database round-trip.
 *
 * "Today" and "this week" are anchored to the store's own time zone, so the
 * windows roll over at local midnight rather than UTC. The current instant is
 * read from the {@link Clock} (not SQL `now()`) so the query is deterministic
 * and testable. A `bounds` CTE computes the store's zone and the local day/week
 * starts once; the outer aggregate then filters orders against those bounds and
 * folds in the vendor count as a scalar subquery. Only `paid` sales count toward
 * the sale-count and revenue figures — rejected/incomplete payments are ingested
 * for reconciliation but never counted as sales or revenue. `from bounds left
 * join sales on true` guarantees exactly one result row even when the store has
 * no sales yet.
 */
export const dashboardMetrics = Effect.gen(function* () {
  const queryable = yield* SapphoQueryable;
  const at = yield* now;

  const rows = yield* queryable.query((db) => {
    const bounds = db.$with("bounds").as(
      db
        .select({
          zone: sql`${stores.timeZone}`.as("zone"),
          dayStart:
            sql`date_trunc('day', ${at}::timestamptz at time zone ${stores.timeZone})`.as(
              "day_start",
            ),
          weekStart:
            sql`date_trunc('week', ${at}::timestamptz at time zone ${stores.timeZone})`.as(
              "week_start",
            ),
        })
        .from(stores)
        .where(eq(stores.id, BOOTSTRAP_STORE_ID)),
    );

    return db
      .with(bounds)
      .select({
        salesToday:
          sql<string>`count(${orders.id}) filter (where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.day_start)`.as(
            "sales_today",
          ),
        revenueTodayCents:
          sql<string>`coalesce(sum(${orders.collectedCents}) filter (where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.day_start), 0)`.as(
            "revenue_today_cents",
          ),
        salesWeek:
          sql<string>`count(${orders.id}) filter (where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.week_start)`.as(
            "sales_week",
          ),
        revenueWeekCents:
          sql<string>`coalesce(sum(${orders.collectedCents}) filter (where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.week_start), 0)`.as(
            "revenue_week_cents",
          ),
        vendorCount: sql<string>`(select count(*) from ${vendors})`.as(
          "vendor_count",
        ),
      })
      .from(bounds)
      .leftJoin(orders, sql`true`);
  });

  return yield* decodeMetrics(rows[0]);
});

// pg/pglite hand back count()/sum() (bigint & numeric) as strings — and, for
// some drivers, as bigint — so each field tolerates number, string, or bigint
// before landing as a plain number.
const MetricValue = Schema.transform(
  Schema.Union(Schema.Number, Schema.String, Schema.BigIntFromSelf),
  Schema.Number,
  { strict: false, decode: (value) => Number(value), encode: (value) => value },
);

const MetricRow = Schema.Struct({
  salesToday: MetricValue,
  revenueTodayCents: MetricValue,
  salesWeek: MetricValue,
  revenueWeekCents: MetricValue,
  vendorCount: MetricValue,
});

const decodeMetrics = Schema.decodeUnknown(MetricRow);
