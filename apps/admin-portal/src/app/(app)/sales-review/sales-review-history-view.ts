import type { MonthRollup } from "./sales-review-history";

/** One month's bar in the sales-review page's trailing-months history. */
export type MonthBar = {
  readonly key: string;
  readonly label: string;
  readonly widthPercent: number;
  readonly grossCents: string;
  readonly saleCount: number;
};

/**
 * Maps the trailing {@link MonthRollup}s (already newest-first) onto
 * display-ready bars: a full "Month YYYY" label, each bar's width relative to
 * the highest-grossing month in the list, and preformatted USD.
 */
export function toMonthBars(months: readonly MonthRollup[]): MonthBar[] {
  const max = Math.max(...months.map((month) => month.grossCents), 1);

  return months.map((month) => ({
    key: month.key,
    label: monthFormatter.format(Date.UTC(month.year, month.month - 1, 1)),
    widthPercent: Math.round((month.grossCents / max) * 100),
    grossCents: formatDollars(month.grossCents),
    saleCount: month.saleCount,
  }));
}

const usdWholeFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// The month/year are plain calendar components (no time zone), so format
// against a fixed UTC date to avoid the runtime's local time zone shifting the
// displayed month.
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

function formatDollars(cents: number): string {
  return usdWholeFormatter.format(cents / 100);
}
