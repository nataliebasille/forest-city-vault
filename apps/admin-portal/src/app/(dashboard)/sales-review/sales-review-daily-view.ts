import type { DailyGross } from "./sales-review-daily";

/** One day's bar in the sales-review page's daily gross chart. */
export type DailyBar = {
  readonly day: number;
  /** 0–100, relative to the month's highest day so far — the bar's height. */
  readonly heightPercent: number;
  /** e.g. "August 8 · $1,234" — shown on hover. */
  readonly tooltip: string;
};

/**
 * Maps the month's raw per-day gross onto display-ready bars: each day's
 * height relative to the month's highest day so far, and a formatted hover
 * tooltip. `monthName` is the bare month name (e.g. "August") the caller
 * already resolved from {@link toCurrentMonthName}, so this stays decoupled
 * from the metrics read model.
 */
export function toDailyBars(
  daily: readonly DailyGross[],
  monthName: string,
): DailyBar[] {
  const max = Math.max(...daily.map((entry) => entry.grossCents), 1);

  return daily.map((entry) => ({
    day: entry.day,
    heightPercent: Math.round((entry.grossCents / max) * 100),
    tooltip: `${monthName} ${entry.day} · ${formatDollars(entry.grossCents)}`,
  }));
}

const usdWholeFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatDollars(cents: number): string {
  return usdWholeFormatter.format(cents / 100);
}
