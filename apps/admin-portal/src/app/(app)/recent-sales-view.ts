import type { RecentSaleRow } from "@ui/recent-sales-table";
import type { RecentSale } from "./recent-sales";

/**
 * Maps the unit-clean {@link RecentSale} read model onto the preformatted
 * {@link RecentSaleRow}s the recent-sales table renders, in order. This is the
 * one place raw facts become display strings: cents become dollars, `occurredAt`
 * becomes a local time in the sale's store time zone, the line-item facts become
 * the "… + N more" item summary, and the distinct vendor names become a single
 * name, "Multiple vendors", or "—".
 */
export function toRecentSaleRows(
  sales: readonly RecentSale[],
): RecentSaleRow[] {
  return sales.map((sale) => ({
    id: sale.id,
    reference: formatReference(sale.id),
    item: formatItem(sale.leadItemName, sale.itemCount),
    vendor: formatVendor(sale.vendorNames),
    time: formatTime(sale.occurredAt, sale.timeZone),
    total: formatCents(sale.totalCents),
  }));
}

const EMPTY = "—";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatReference(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

function formatItem(leadItemName: string | null, itemCount: number): string {
  if (leadItemName === null) {
    return EMPTY;
  }

  const extra = itemCount - 1;
  return extra > 0 ? `${leadItemName} + ${extra} more` : leadItemName;
}

function formatVendor(vendorNames: readonly string[]): string {
  if (vendorNames.length === 0) {
    return EMPTY;
  }

  return vendorNames.length === 1 ? vendorNames[0] : "Multiple vendors";
}

function formatTime(occurredAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(occurredAt);
}

function formatCents(cents: number): string {
  return usdFormatter.format(cents / 100);
}
