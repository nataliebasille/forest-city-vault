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

/** How many trailing months the sales-review page's history chart shows. */
export const TRAILING_MONTHS_COUNT = 8;

/** One month's rollup for the sales-review page's trailing-months history. */
export type MonthRollup = {
  readonly key: string;
  readonly year: number;
  readonly month: number;
  readonly grossCents: number;
  readonly saleCount: number;
};

/**
 * Reads gross and sale count per month for the trailing
 * {@link TRAILING_MONTHS_COUNT} months (including the current, partial month),
 * newest first, zero-filled for months with no sales — the same shape
 * {@link salesReviewDaily} uses for days, but grouped by month instead. Only
 * captured (`paid`) orders contribute to either figure.
 *
 * Months are anchored to the store's own time zone, and the whole read is one
 * database round-trip via a correlated `json_agg` subquery.
 */
export const salesReviewHistory = Effect.gen(function* () {
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
        })
        .from(stores)
        .where(eq(stores.id, BOOTSTRAP_STORE_ID)),
    );

    return db
      .with(bounds)
      .select({
        anchorYear: sql<string>`extract(year from bounds.month_start)::int`.as(
          "anchor_year",
        ),
        anchorMonth:
          sql<string>`extract(month from bounds.month_start)::int`.as(
            "anchor_month",
          ),
        months:
          sql<unknown>`coalesce((select json_agg(json_build_object('year', m.year, 'month', m.month, 'grossCents', m.gross, 'saleCount', m.cnt) order by m.year desc, m.month desc) from (select extract(year from date_trunc('month', ${orders.occurredAt} at time zone bounds.zone))::int as year, extract(month from date_trunc('month', ${orders.occurredAt} at time zone bounds.zone))::int as month, sum(${orders.collectedCents}) as gross, count(${orders.id}) as cnt from ${orders} where ${orders.status} = 'paid' and ${orders.occurredAt} at time zone bounds.zone >= bounds.month_start - interval '${sql.raw(String(TRAILING_MONTHS_COUNT - 1))} months' group by year, month) m), '[]'::json)`.as(
            "months",
          ),
      })
      .from(bounds);
  });

  const decoded = yield* decodeHistory(rows[0]);
  return fillMonths(decoded.anchorYear, decoded.anchorMonth, decoded.months);
});

/**
 * Expands a sparse year/month → rollup list into exactly
 * {@link TRAILING_MONTHS_COUNT} entries, newest first, starting at the anchor
 * month and stepping back one month at a time.
 */
function fillMonths(
  anchorYear: number,
  anchorMonth: number,
  sparse: readonly {
    year: number;
    month: number;
    grossCents: number;
    saleCount: number;
  }[],
): MonthRollup[] {
  const byKey = new Map(
    sparse.map((entry) => [monthKey(entry.year, entry.month), entry]),
  );

  return Array.from({ length: TRAILING_MONTHS_COUNT }, (_, index) => {
    // Step back `index` months from the anchor, borrowing a year whenever the
    // month number would fall below January.
    const totalMonths = anchorYear * 12 + (anchorMonth - 1) - index;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const key = monthKey(year, month);
    const entry = byKey.get(key);

    return {
      key,
      year,
      month,
      grossCents: entry?.grossCents ?? 0,
      saleCount: entry?.saleCount ?? 0,
    };
  });
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// pg/pglite hand back count()/sum() (bigint & numeric) as strings — and, for
// some drivers, as bigint — so numeric fields tolerate number, string, or
// bigint before landing as a plain number.
const NumericValue = Schema.transform(
  Schema.Union(Schema.Number, Schema.String, Schema.BigIntFromSelf),
  Schema.Number,
  { strict: false, decode: (value) => Number(value), encode: (value) => value },
);

const MonthEntryRow = Schema.Struct({
  year: NumericValue,
  month: NumericValue,
  grossCents: NumericValue,
  saleCount: NumericValue,
});

// Drivers hand a `json` column back either already parsed (an array of
// objects) or, in some setups, as a raw JSON string; normalize a string
// before decoding the month list.
const MonthsValue = Schema.transform(
  Schema.Unknown,
  Schema.Array(MonthEntryRow),
  {
    strict: false,
    decode: (value) => (typeof value === "string" ? JSON.parse(value) : value),
    encode: (value) => value,
  },
);

const HistoryRow = Schema.Struct({
  anchorYear: NumericValue,
  anchorMonth: NumericValue,
  months: MonthsValue,
});

const decodeHistory = Schema.decodeUnknown(HistoryRow);
