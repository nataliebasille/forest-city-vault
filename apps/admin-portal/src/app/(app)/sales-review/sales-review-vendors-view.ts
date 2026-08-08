import type { VendorRollup } from "./sales-review-vendors";

/** One row of the sales-review page's top-vendors list, ranked and formatted. */
export type VendorRow = {
  readonly rank: number;
  readonly name: string;
  readonly grossCents: string;
};

/**
 * Maps the {@link VendorRollup}s (already ranked highest-gross-first by the
 * read model) onto display-ready rows: a 1-based rank and preformatted USD.
 */
export function toVendorRows(rollups: readonly VendorRollup[]): VendorRow[] {
  return rollups.map((rollup, index) => ({
    rank: index + 1,
    name: rollup.name,
    grossCents: formatDollars(rollup.grossCents),
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
