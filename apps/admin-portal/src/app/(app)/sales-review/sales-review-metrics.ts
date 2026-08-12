import { now } from "@forest-city-vault/core-clock";
import {
  BOOTSTRAP_STORE_ID,
  SapphoQueryable,
} from "@forest-city-vault/infrastructure-database";
import {
  orders,
  stores,
} from "@forest-city-vault/infrastructure-database/schema";
import { eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

/**
 * The numeric snapshot behind the sales-review page's metric strip. All money
 * is in whole cents and all counts are whole numbers; formatting and the
 * pace-delta ratio are the presentation layer's job, not this read model's.
 *
 * Only captured (`paid`) sales are counted — rejected/incomplete payments are
 * ingested for reconciliation but never contribute to these figures. `gross`
 * and `net` follow Clover's reporting definitions: gross is item sales before
 * discounts (the sale total), and net is gross less discounts (Clover's
 * `net = gross − discounts − refunds`; refunds are not modeled here, so
 * `net = gross − discounts`).
 */
export type SalesReviewMetrics = {
  readonly monthToDateSaleCount: number;
  readonly monthToDateGrossCents: number;
  readonly monthToDateNetCents: number;
  readonly previousMonthPaceGrossCents: number;
  /** The current month, in the store's own time zone (1 = January). */
  readonly monthStartYear: number;
  readonly monthStartMonth: number;
};

/**
 * Reads the sales-review page's headline metrics in a single database
 * round-trip: gross, net, and sale count for the current month to date, plus
 * the same calendar-day window of the previous month (e.g. days 1–8) so the
 * pace comparison is against an equally partial month rather than a full one.
 * Every figure counts only captured (`paid`) sales; net is gross less discounts
 * (Clover's `net = gross − discounts`, refunds not modeled).
 *
 * "Month to date" and "today" are anchored to the store's own time zone, so
 * the windows roll over at local midnight rather than UTC. The current
 * instant is read from the {@link Clock} (not SQL `now()`) so the query is
 * deterministic and testable — the same `bounds` CTE shape `dashboardMetrics`
 * uses, extended with the previous month's start and its matching cutoff.
 *
 * The previous-month cutoff is `least(prevMonthStart + today's day-of-month,
 * monthStart)`: when today's day-of-month exceeds the previous month's own
 * length (e.g. today is the 31st but the previous month only had 30 days),
 * adding that many days would spill past the previous month's end and into
 * the current month, double-counting those days in both figures. Clamping to
 * `monthStart` caps the window at the previous month's last instant instead.
 */
export const salesReviewMetrics = Effect.gen(function* () {
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
          prevMonthStart:
            sql`date_trunc('month', ${at}::timestamptz at time zone ${stores.timeZone}) - interval '1 month'`.as(
              "prev_month_start",
            ),
        })
        .from(stores)
        .where(eq(stores.id, BOOTSTRAP_STORE_ID)),
    );

    return db
      .with(bounds)
      .select({
        monthToDateSaleCount:
          sql<string>`count(${orders.id}) filter (where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.month_start and ${orders.occurredAt} at time zone bounds.zone < bounds.day_start + interval '1 day')`.as(
            "month_to_date_sale_count",
          ),
        monthToDateGrossCents:
          sql<string>`coalesce(sum(${orders.collectedCents}) filter (where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.month_start and ${orders.occurredAt} at time zone bounds.zone < bounds.day_start + interval '1 day'), 0)`.as(
            "month_to_date_gross_cents",
          ),
        monthToDateNetCents:
          sql<string>`coalesce(sum(${orders.collectedCents}) filter (where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.month_start and ${orders.occurredAt} at time zone bounds.zone < bounds.day_start + interval '1 day'), 0)`.as(
            "month_to_date_net_cents",
          ),
        previousMonthPaceGrossCents:
          sql<string>`coalesce(sum(${orders.collectedCents}) filter (where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.prev_month_start and ${orders.occurredAt} at time zone bounds.zone < least(bounds.prev_month_start + (extract(day from bounds.day_start) * interval '1 day'), bounds.month_start)), 0)`.as(
            "previous_month_pace_gross_cents",
          ),
        monthStartYear:
          sql<string>`max(extract(year from bounds.month_start))::int`.as(
            "month_start_year",
          ),
        monthStartMonth:
          sql<string>`max(extract(month from bounds.month_start))::int`.as(
            "month_start_month",
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
  monthToDateSaleCount: MetricValue,
  monthToDateGrossCents: MetricValue,
  monthToDateNetCents: MetricValue,
  previousMonthPaceGrossCents: MetricValue,
  monthStartYear: MetricValue,
  monthStartMonth: MetricValue,
});

const decodeMetrics = Schema.decodeUnknown(MetricRow);
