import { cn } from "@/lib/cn";

/**
 * One vendor's slice of a {@link RecentSaleRow}'s hover breakdown: `vendor` is
 * the vendor name (or "Custom item" for items with no vendor) and `items` are
 * that vendor's line items on the sale, each with a `name` and a preformatted
 * USD `price`. The table does no formatting itself.
 */
export type RecentSaleVendorGroup = {
  readonly vendor: string;
  readonly items: readonly { readonly name: string; readonly price: string }[];
};

/**
 * A single row of the {@link RecentSalesTable}: one sale, with every column
 * already formatted for display. `reference` is the shortened sale id, `item` is
 * the derived summary string ("… + N more" or the lone item name, "—" for none),
 * `vendorGroups` is the full breakdown revealed on hover — the sale's items
 * grouped by vendor (empty when the sale has no line items) — `time` is the
 * sale's local time, and `total` is the preformatted currency amount. The table
 * does no formatting itself.
 */
export type RecentSaleRow = {
  readonly id: string;
  readonly reference: string;
  readonly item: string;
  readonly vendorGroups: readonly RecentSaleVendorGroup[];
  readonly time: string;
  readonly total: string;
};

/**
 * The dashboard's "Recent sales" table: a dense, read-only list of the store's
 * latest sales. It renders exactly the {@link RecentSaleRow}s it is handed, in
 * order, and owns none of the data — callers pass preformatted rows. Because a
 * sale's vendor lives on each line item, there is no standalone vendor column;
 * hovering (or focusing) a sale's item cell reveals every item grouped by
 * vendor, with its price. When there are no rows it shows an empty-state message
 * instead of a bare table body.
 */
export function RecentSalesTable({
  rows,
}: {
  readonly rows: readonly RecentSaleRow[];
}) {
  return (
    <section className="rounded-lg border border-secondary-500/15">
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
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary-500/10">
          {rows.length === 0 ?
            <tr>
              <td
                colSpan={4}
                className="px-4 py-6 text-center text-on-surface-50/55"
              >
                No sales yet.
              </td>
            </tr>
          : rows.map((row) => (
              <tr key={row.id} className="hover:bg-secondary-500/5">
                <td className="px-4 py-2.5 font-mono text-xs text-on-surface-50/60">
                  {row.reference}
                </td>
                <td className="px-4 py-2.5 font-subheading font-medium text-ink">
                  <ItemCell
                    summary={row.item}
                    vendorGroups={row.vendorGroups}
                  />
                </td>
                <td className="px-4 py-2.5 text-on-surface-50/60">
                  {row.time}
                </td>
                <td className="px-4 py-2.5 text-right font-subheading font-semibold text-ink">
                  {row.total}
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </section>
  );
}

/**
 * The Item column's contents. For a sale with line items it renders the summary
 * with a dotted underline and, on hover or keyboard focus, a popover listing the
 * sale's items grouped under each vendor's name with their prices — the only
 * place a multi-vendor sale's per-item vendors are shown. A sale with no line
 * items renders the bare summary ("—") with no affordance.
 */
function ItemCell({
  summary,
  vendorGroups,
}: {
  readonly summary: string;
  readonly vendorGroups: readonly RecentSaleVendorGroup[];
}) {
  if (vendorGroups.length === 0) {
    return summary;
  }

  return (
    <span className="group/items relative inline-block">
      <span
        tabIndex={0}
        className="cursor-help border-b border-dotted border-on-surface-50/40 outline-none"
      >
        {summary}
      </span>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden min-w-64 max-w-80",
          "rounded-xl border border-white/15 bg-secondary-500 p-1 text-on-secondary-500",
          "shadow-2xl shadow-black/40 ring-1 ring-black/20",
          "group-hover/items:block group-focus-within/items:block",
        )}
      >
        <span className="flex flex-col gap-1.5">
          {vendorGroups.map((group) => (
            <span key={group.vendor} className="flex flex-col">
              <span className="px-2.5 pb-0.5 pt-1 font-subheading text-[0.65rem] font-semibold uppercase tracking-wide text-on-secondary-500/50">
                {group.vendor}
              </span>
              {group.items.map((item, index) => (
                <span
                  key={index}
                  className="flex items-baseline gap-3 rounded-lg px-2.5 py-1 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 font-subheading font-semibold tabular-nums">
                    {item.price}
                  </span>
                </span>
              ))}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
