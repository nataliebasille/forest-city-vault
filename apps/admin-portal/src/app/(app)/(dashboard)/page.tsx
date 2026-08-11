import { privatePage } from "@/runtime";
import { now } from "@forest-city-vault/core-clock";
import { dashboardMetrics } from "./dashboard-metrics";
import { toDashboardMetricTiles } from "./dashboard-metrics-view";
import { recentSales } from "./recent-sales";
import { toRecentSaleRows } from "./recent-sales-view";
import { RecentSalesTable } from "./recent-sales-table";
import { MetricGrid } from "@ui/metric-grid";
import { Effect } from "effect";

// The auth gate reads request cookies and the database per request, so this page
// must render dynamically (never statically prerendered at build time).
export const dynamic = "force-dynamic";

export default privatePage("admin-dashboard", () =>
  Effect.gen(function* () {
    const metrics = yield* dashboardMetrics;
    const tiles = toDashboardMetricTiles(metrics);

    const sales = yield* recentSales;
    const saleRows = toRecentSaleRows(sales, yield* now);

    return (
      <div className="flex flex-1 flex-col">
        <header className="hidden h-[var(--shell-header-h)] items-center justify-between gap-4 border-b border-ink/10 px-6 md:flex md:px-8">
          <h1 className="font-heading font-semibold text-ink">Dashboard</h1>
        </header>

        <main className="flex flex-1 flex-col gap-6 px-6 py-6 md:px-8">
          <MetricGrid metrics={tiles} />
          <RecentSalesTable rows={saleRows} />
        </main>
      </div>
    );
  }),
);
