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

/** One day's gross for the sales-review page's daily bar chart. */
export type DailyGross = {
  readonly day: number;
  readonly grossCents: number;
};

/**
 * Reads the current month's per-day gross, from day 1 through today, in the
 * store's own time zone, counting only captured (`paid`) orders. Days with no
 * sales are zero-filled — the query only gets back the days that actually had
 * sales, so a `bounds`-anchored {@link fillDays} pass turns that sparse list
 * into one entry per day, which is what the bar chart needs for a continuous
 * x-axis.
 *
 * The per-day sums are built as a single JSON array via a correlated subquery
 * (the same `json_agg` shape `recentSales` uses for its line items), so the
 * whole read is one database round-trip.
 */
export const salesReviewDaily = Effect.gen(function* () {
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
        currentDay: sql<string>`extract(day from bounds.day_start)::int`.as(
          "current_day",
        ),
        daily:
          sql<unknown>`coalesce((select json_agg(json_build_object('day', d.day, 'grossCents', d.gross) order by d.day) from (select extract(day from ${orders.occurredAt} at time zone bounds.zone)::int as day, sum(${orders.collectedCents}) as gross from ${orders} where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.month_start and ${orders.occurredAt} at time zone bounds.zone < bounds.day_start + interval '1 day' group by day) d), '[]'::json)`.as(
            "daily",
          ),
      })
      .from(bounds);
  });

  const decoded = yield* decodeDaily(rows[0]);
  return fillDays(decoded.currentDay, decoded.daily);
});

/** Expands a sparse day → gross list into one entry for every day 1..currentDay. */
function fillDays(
  currentDay: number,
  sparse: readonly { day: number; grossCents: number }[],
): DailyGross[] {
  const byDay = new Map(sparse.map((entry) => [entry.day, entry.grossCents]));
  return Array.from({ length: currentDay }, (_, index) => {
    const day = index + 1;
    return { day, grossCents: byDay.get(day) ?? 0 };
  });
}

// pg/pglite hand back count()/sum() (bigint & numeric) as strings — and, for
// some drivers, as bigint — so numeric fields tolerate number, string, or
// bigint before landing as a plain number.
const NumericValue = Schema.transform(
  Schema.Union(Schema.Number, Schema.String, Schema.BigIntFromSelf),
  Schema.Number,
  { strict: false, decode: (value) => Number(value), encode: (value) => value },
);

const DailyEntryRow = Schema.Struct({
  day: NumericValue,
  grossCents: NumericValue,
});

// Drivers hand a `json` column back either already parsed (an array of
// objects) or, in some setups, as a raw JSON string; normalize a string
// before decoding the day list.
const DailyValue = Schema.transform(
  Schema.Unknown,
  Schema.Array(DailyEntryRow),
  {
    strict: false,
    decode: (value) => (typeof value === "string" ? JSON.parse(value) : value),
    encode: (value) => value,
  },
);

const DailyRow = Schema.Struct({
  currentDay: NumericValue,
  daily: DailyValue,
});

const decodeDaily = Schema.decodeUnknown(DailyRow);
