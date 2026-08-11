import type { Metric } from "@ui/metric-grid";
import type { SalesReviewMetrics } from "./sales-review-metrics";

/**
 * Maps the numeric {@link SalesReviewMetrics} read model onto the sales-review
 * page's metric-strip tiles, in display order, and computes the pace delta
 * (this month to date vs. the same calendar-day window last month).
 *
 * Gross and net follow Clover's reporting split: gross is item sales before
 * discounts, net is gross less discounts. Both count only captured (`paid`)
 * sales upstream.
 */
export function toSalesReviewMetricTiles(
  metrics: SalesReviewMetrics,
): Metric[] {
  const avgCents = toAverageCents(metrics);

  return [
    {
      key: "gross",
      label: "Gross · this month",
      value: formatDollars(metrics.monthToDateGrossCents),
      delta: `${toPaceDeltaLabel(metrics)} vs last month`,
    },
    {
      key: "net",
      label: "Net · this month",
      value: formatDollars(metrics.monthToDateNetCents),
      hint: "after discounts",
    },
    {
      key: "sales",
      label: "Sales",
      value: formatCount(metrics.monthToDateSaleCount),
      hint: "recorded this month",
    },
    {
      key: "avg",
      label: "Avg. sale",
      value: formatCents(avgCents),
      hint: "per sale",
    },
  ];
}

/** The current month's full label, e.g. "August 2026". */
export function toCurrentMonthLabel(metrics: SalesReviewMetrics): string {
  return monthFormatter.format(
    Date.UTC(metrics.monthStartYear, metrics.monthStartMonth - 1, 1),
  );
}

/** The current month's bare name, e.g. "August" — for compact labels. */
export function toCurrentMonthName(metrics: SalesReviewMetrics): string {
  return monthNameFormatter.format(
    Date.UTC(metrics.monthStartYear, metrics.monthStartMonth - 1, 1),
  );
}

/** The signed pace-delta percent, e.g. "+8.4%" — for the daily chart's pill. */
export function toPaceDeltaLabel(metrics: SalesReviewMetrics): string {
  return formatDelta(toPaceDelta(metrics));
}

/** Whether month-to-date gross is pacing ahead of the comparison window. */
export function isPacingAhead(metrics: SalesReviewMetrics): boolean {
  return toPaceDelta(metrics) >= 0;
}

/** The previous month's same-day-window gross, formatted as whole-dollar USD. */
export function toPreviousMonthPaceLabel(metrics: SalesReviewMetrics): string {
  return formatDollars(metrics.previousMonthPaceGrossCents);
}

/**
 * The ratio by which month-to-date gross is ahead of (or behind) the same
 * calendar-day window last month. Zero when there is no previous-month figure
 * to compare against, so a brand-new store's first month doesn't render a
 * misleading "+∞%".
 */
function toPaceDelta(metrics: SalesReviewMetrics): number {
  if (metrics.previousMonthPaceGrossCents === 0) {
    return 0;
  }
  return (
    metrics.monthToDateGrossCents / metrics.previousMonthPaceGrossCents - 1
  );
}

function toAverageCents(metrics: SalesReviewMetrics): number {
  return Math.round(
    metrics.monthToDateGrossCents / Math.max(1, metrics.monthToDateSaleCount),
  );
}

const countFormatter = new Intl.NumberFormat("en-US");

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const usdWholeFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// The month/year are plain calendar components (no time zone), so format
// against a fixed UTC date to avoid the runtime's local time zone shifting the
// displayed month.
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

const monthNameFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
});

function formatCount(value: number): string {
  return countFormatter.format(value);
}

function formatCents(cents: number): string {
  return usdFormatter.format(cents / 100);
}

/** Whole-dollar USD for headline totals, e.g. 128450 -> "$1,285". */
function formatDollars(cents: number): string {
  return usdWholeFormatter.format(cents / 100);
}

/** A ratio delta as a signed percent, e.g. 0.084 -> "+8.4%". */
function formatDelta(ratio: number): string {
  const sign = ratio > 0 ? "+" : "";
  return `${sign}${percentFormatter.format(ratio)}`;
}
