/**
 * A single row of the {@link RecentSalesTable}: one sale, with every column
 * already formatted for display. `reference` is the shortened sale id, `item`
 * and `vendor` are the derived summary strings ("… + N more", a vendor name,
 * "Multiple vendors", or "—"), `time` is the sale's local time, and `total` is
 * the preformatted currency amount. The table does no formatting itself.
 */
export type RecentSaleRow = {
  readonly id: string;
  readonly reference: string;
  readonly item: string;
  readonly vendor: string;
  readonly time: string;
  readonly total: string;
};

/**
 * The dashboard's "Recent sales" table: a dense, read-only list of the store's
 * latest sales. It renders exactly the {@link RecentSaleRow}s it is handed, in
 * order, and owns none of the data — callers pass preformatted rows. When there
 * are no rows it shows an empty-state message instead of a bare table body.
 */
export function RecentSalesTable({
  rows,
}: {
  readonly rows: readonly RecentSaleRow[];
}) {
  return (
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
            <th className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary-500/10">
          {rows.length === 0 ?
            <tr>
              <td
                colSpan={5}
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
                  {row.item}
                </td>
                <td className="px-4 py-2.5 text-on-surface-50/75">
                  {row.vendor}
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
