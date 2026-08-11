import { privatePage } from "@/runtime";
import { MetricGrid } from "@ui/metric-grid";
import { Effect } from "effect";
import { salesReviewDaily } from "./sales-review-daily";
import { toDailyBars } from "./sales-review-daily-view";
import { salesReviewHistory } from "./sales-review-history";
import { toMonthBars } from "./sales-review-history-view";
import { salesReviewMetrics } from "./sales-review-metrics";
import {
  isPacingAhead,
  toCurrentMonthLabel,
  toCurrentMonthName,
  toPaceDeltaLabel,
  toPreviousMonthPaceLabel,
  toSalesReviewMetricTiles,
} from "./sales-review-metrics-view";
import { salesReviewVendors } from "./sales-review-vendors";
import { toVendorRows } from "./sales-review-vendors-view";

// The auth gate reads request cookies and the database per request, so this
// page must render dynamically (never statically prerendered at build time).
export const dynamic = "force-dynamic";

/**
 * The "review all sales" page: an at-a-glance analytics dashboard (metric
 * strip, daily-gross bar chart with a pace pill, top vendors, and a
 * trailing-months trend) rather than a transaction table — folded in from the
 * sales-review prototype's chosen Variant B ("Comparison dashboard").
 */
export default privatePage("sales-review", () =>
  Effect.gen(function* () {
    const metrics = yield* salesReviewMetrics;
    const daily = yield* salesReviewDaily;
    const vendors = yield* salesReviewVendors;
    const history = yield* salesReviewHistory;

    const tiles = toSalesReviewMetricTiles(metrics);
    const monthLabel = toCurrentMonthLabel(metrics);
    const dailyBars = toDailyBars(daily, toCurrentMonthName(metrics));
    const vendorRows = toVendorRows(vendors);
    const monthBars = toMonthBars(history);
    const paceDeltaLabel = toPaceDeltaLabel(metrics);
    const pacingAhead = isPacingAhead(metrics);

    return (
      <div className="flex flex-1 flex-col">
        <header className="hidden h-[var(--shell-header-h)] items-center justify-between gap-4 border-b border-ink/10 px-6 md:flex md:px-8">
          <h1 className="font-heading font-semibold text-ink">Sales review</h1>
          <span className="font-subheading text-sm font-medium text-on-surface-50/60">
            {monthLabel}
          </span>
        </header>

        <main className="flex flex-1 flex-col gap-6 px-6 py-6 md:px-8">
          <MetricGrid metrics={tiles} />

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <SectionHeader title="Daily gross">
                <span
                  className={`rounded-full px-2.5 py-0.5 font-subheading text-xs font-semibold ${
                    pacingAhead ?
                      "bg-success-500/15 text-success-700"
                    : "bg-danger-500/15 text-danger-700"
                  }`}
                >
                  {paceDeltaLabel} vs last month
                </span>
              </SectionHeader>
              <div className="px-4 py-5">
                <div className="flex h-44 items-end gap-2 border-b border-secondary-500/10">
                  {dailyBars.map((bar) => (
                    <div
                      key={bar.day}
                      className="flex h-full flex-1 flex-col justify-end"
                    >
                      <div
                        className="w-full rounded-t bg-primary-500/70"
                        style={{ height: `${bar.heightPercent}%` }}
                        title={bar.tooltip}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  {dailyBars.map((bar) => (
                    <span
                      key={bar.day}
                      className="flex-1 text-center font-subheading text-[11px] text-on-surface-50/45"
                    >
                      {bar.day}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-on-surface-50/55">
                  Same {dailyBars.length}-day window last month{" "}
                  <span className="font-subheading font-semibold text-ink">
                    {toPreviousMonthPaceLabel(metrics)}
                  </span>
                </p>
              </div>
            </Card>

            <Card>
              <SectionHeader title="Top vendors this month" />
              {vendorRows.length === 0 ?
                <p className="px-4 py-6 text-center text-sm text-on-surface-50/55">
                  No vendor sales recorded this month yet.
                </p>
              : <ol className="flex flex-col divide-y divide-secondary-500/10">
                  {vendorRows.map((vendor) => (
                    <li
                      key={vendor.name}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary-500/10 font-subheading text-xs font-semibold text-on-surface-50/70">
                        {vendor.rank}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-subheading text-sm text-ink">
                        {vendor.name}
                      </span>
                      <span className="font-subheading text-sm font-semibold tabular-nums text-ink">
                        {vendor.grossCents}
                      </span>
                    </li>
                  ))}
                </ol>
              }
            </Card>
          </div>

          <Card>
            <SectionHeader title="Monthly gross — trailing months" />
            <div className="flex flex-col gap-2.5 px-4 py-5">
              {monthBars.map((month) => (
                <div key={month.key} className="flex items-center gap-4">
                  <span className="w-28 shrink-0 font-subheading text-sm text-on-surface-50/70">
                    {month.label}
                  </span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-secondary-500/5">
                    <div
                      className="flex h-full items-center justify-end rounded bg-accent-500/70 pr-2"
                      style={{ width: `${month.widthPercent}%` }}
                    >
                      <span className="font-subheading text-[11px] font-semibold text-on-accent-500">
                        {month.grossCents}
                      </span>
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right font-subheading text-xs text-on-surface-50/50">
                    {month.saleCount} sales
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </main>
      </div>
    );
  }),
);

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-secondary-500/15 bg-surface-50">
      {children}
    </section>
  );
}

function SectionHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-secondary-500/15 px-4 py-3">
      <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}
