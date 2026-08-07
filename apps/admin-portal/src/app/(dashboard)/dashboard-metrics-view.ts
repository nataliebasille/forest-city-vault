import type { Metric } from "@ui/metric-grid";
import type { DashboardMetrics } from "./dashboard-metrics";

/**
 * Maps the numeric {@link DashboardMetrics} read model onto the five preformatted
 * {@link Metric} tiles the dashboard's grid renders, in display order. This is
 * the one place cents become dollars and raw counts become localized strings —
 * the grid itself stays presentation-only and the read model stays unit-clean.
 */
export function toDashboardMetricTiles(metrics: DashboardMetrics): Metric[] {
  return [
    {
      key: "sales-today",
      label: "Sales today",
      value: formatCount(metrics.salesToday),
    },
    {
      key: "revenue-today",
      label: "Revenue today",
      value: formatCents(metrics.revenueTodayCents),
    },
    {
      key: "sales-week",
      label: "Sales this week",
      value: formatCount(metrics.salesWeek),
    },
    {
      key: "revenue-week",
      label: "Revenue this week",
      value: formatCents(metrics.revenueWeekCents),
    },
    {
      key: "vendors",
      label: "Vendors",
      value: formatCount(metrics.vendorCount),
    },
  ];
}

const countFormatter = new Intl.NumberFormat("en-US");

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatCount(value: number): string {
  return countFormatter.format(value);
}

function formatCents(cents: number): string {
  return usdFormatter.format(cents / 100);
}
