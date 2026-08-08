import type {
  RecentSaleVendorGroup,
  RecentSaleRow,
} from "./recent-sales-table";
import type { RecentSale, RecentSaleItem } from "./recent-sales";

/**
 * Maps the unit-clean {@link RecentSale} read model onto the preformatted
 * {@link RecentSaleRow}s the recent-sales table renders, in order. This is the
 * one place raw facts become display strings: cents become dollars, `occurredAt`
 * becomes a local time in the sale's store time zone, the line items become the
 * "… + N more" cell summary, and — for the hover breakdown — they are grouped by
 * vendor (each vendor's name with its items' names and prices).
 */
export function toRecentSaleRows(
  sales: readonly RecentSale[],
): RecentSaleRow[] {
  return sales.map((sale) => ({
    id: sale.id,
    reference: formatReference(sale.id),
    item: formatItemSummary(sale.items),
    vendorGroups: groupItemsByVendor(sale.items),
    time: formatTime(sale.occurredAt, sale.timeZone),
    total: formatCents(sale.totalCents),
  }));
}

const EMPTY = "—";

/** The vendor-group label for line items that have no linked vendor. */
const CUSTOM_ITEM = "Custom item";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatReference(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

function formatItemSummary(items: readonly RecentSaleItem[]): string {
  const [lead, ...rest] = items;
  if (lead === undefined) {
    return EMPTY;
  }

  return rest.length > 0 ? `${lead.name} + ${rest.length} more` : lead.name;
}

/**
 * Buckets a sale's line items by vendor for the hover breakdown, keeping the
 * incoming lead-first (highest gross amount) order. Iterating in that order and
 * bucketing by first appearance means both the vendor groups and the items
 * within each group stay ordered by value, so the vendor of the sale's headline
 * item leads. Items with no vendor collapse into a single "Custom item" group.
 */
function groupItemsByVendor(
  items: readonly RecentSaleItem[],
): RecentSaleVendorGroup[] {
  const groups: RecentSaleVendorGroup[] = [];
  const byVendor = new Map<string, { name: string; price: string }[]>();

  for (const item of items) {
    const vendor = item.vendorName ?? CUSTOM_ITEM;
    const entry = { name: item.name, price: formatCents(item.amountCents) };

    const existing = byVendor.get(vendor);
    if (existing === undefined) {
      const created = [entry];
      byVendor.set(vendor, created);
      groups.push({ vendor, items: created });
    } else {
      existing.push(entry);
    }
  }

  return groups;
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
