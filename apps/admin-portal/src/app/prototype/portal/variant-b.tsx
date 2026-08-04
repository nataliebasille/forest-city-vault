// PROTOTYPE — throwaway. Variant B: "Sidebar workspace". A persistent left
// sidebar drives navigation; the main pane is a dense, table-centric operational
// view (recent sales table + vendor roster). Classic admin app-shell hierarchy:
// navigation-first, built for working through records, not glancing at numbers.

import {
  metrics,
  navItems,
  owner,
  recentSales,
  store,
  topVendors,
} from "./stub-data";

export const variantName = "Sidebar workspace";

const saleStatus: Record<string, string> = {
  completed: "badge-soft/success",
  refunded: "badge-soft/danger",
  pending: "badge-soft/accent",
};

const vendorStatus: Record<string, string> = {
  active: "badge-soft/success",
  onboarding: "badge-soft/accent",
  paused: "badge-soft/surface",
};

export function VariantB() {
  return (
    <div className="flex min-h-screen bg-surface-50">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-secondary-500 text-on-secondary-500 md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-500 font-heading text-sm font-bold text-on-primary-500">
            FV
          </span>
          <span className="font-heading text-base font-semibold">
            {store.name}
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {navItems.map((item, i) => (
            <a
              key={item.key}
              href="#"
              className={`flex items-center gap-3 rounded-md px-3 py-2 font-subheading text-sm ${
                i === 0
                  ? "bg-white/10 font-semibold text-white"
                  : "text-on-secondary-500/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="text-base opacity-80">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 font-subheading text-sm font-semibold text-on-primary-500">
              ME
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate font-subheading text-sm font-semibold">
                {owner.name}
              </div>
              <div className="truncate text-xs text-on-secondary-500/60">
                {owner.email}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-md border border-white/15 px-3 py-1.5 font-subheading text-xs text-on-secondary-500/80 hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-secondary-500/15 px-8 py-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-ink">
              Dashboard
            </h1>
            <p className="text-sm text-on-surface-50/60">
              {store.name} · {store.timeZone}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center rounded-md border border-secondary-500/20 px-3 py-1.5 text-sm text-on-surface-50/50 lg:flex">
              Search records…
            </div>
            <button type="button" className="btn-solid/primary font-subheading text-sm">
              + New
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 px-8 py-6">
          {/* Compact metric strip */}
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-secondary-500/15 bg-secondary-500/15 sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map((m) => (
              <div key={m.key} className="flex flex-col gap-0.5 bg-surface-50 px-4 py-3">
                <span className="font-subheading text-[11px] font-medium uppercase tracking-wide text-on-surface-50/55">
                  {m.label}
                </span>
                <span className="font-heading text-xl font-semibold text-ink">
                  {m.value}
                </span>
                <span className="text-[11px] text-on-surface-50/50">{m.delta}</span>
              </div>
            ))}
          </section>

          {/* Recent sales table */}
          <section className="overflow-hidden rounded-lg border border-secondary-500/15">
            <div className="flex items-center justify-between border-b border-secondary-500/15 px-4 py-3">
              <h2 className="font-heading text-base font-semibold text-ink">
                Recent sales
              </h2>
              <a href="#" className="font-subheading text-sm text-primary-600">
                View all →
              </a>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary-500/5 font-subheading text-xs uppercase tracking-wide text-on-surface-50/55">
                <tr>
                  <th className="px-4 py-2 font-medium">Sale</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-500/10">
                {recentSales.map((s) => (
                  <tr key={s.id} className="hover:bg-secondary-500/5">
                    <td className="px-4 py-2.5 font-mono text-xs text-on-surface-50/60">
                      {s.id}
                    </td>
                    <td className="px-4 py-2.5 font-subheading font-medium text-ink">
                      {s.summary}
                    </td>
                    <td className="px-4 py-2.5 text-on-surface-50/75">{s.vendor}</td>
                    <td className="px-4 py-2.5 text-on-surface-50/60">{s.time}</td>
                    <td className="px-4 py-2.5">
                      <span className={saleStatus[s.status]}>{s.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-subheading font-semibold text-ink">
                      {s.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Vendor roster table */}
          <section className="overflow-hidden rounded-lg border border-secondary-500/15">
            <div className="flex items-center justify-between border-b border-secondary-500/15 px-4 py-3">
              <h2 className="font-heading text-base font-semibold text-ink">
                Vendor roster
              </h2>
              <a href="#" className="font-subheading text-sm text-primary-600">
                Manage vendors →
              </a>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary-500/5 font-subheading text-xs uppercase tracking-wide text-on-surface-50/55">
                <tr>
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Sales / wk</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Revenue / wk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-500/10">
                {topVendors.map((v) => (
                  <tr key={v.name} className="hover:bg-secondary-500/5">
                    <td className="px-4 py-2.5 font-subheading font-medium text-ink">
                      {v.name}
                    </td>
                    <td className="px-4 py-2.5 text-on-surface-50/75">
                      {v.category}
                    </td>
                    <td className="px-4 py-2.5 text-on-surface-50/75">
                      {v.salesWeek}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={vendorStatus[v.status]}>{v.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-subheading font-semibold text-ink">
                      {v.revenue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </div>
  );
}
