import type {
  RecentSaleVendorGroup,
  RecentSaleRow,
} from "./recent-sales-table";
import type { RecentSale, RecentSaleItem } from "./recent-sales";

/**
 * Maps the unit-clean {@link RecentSale} read model onto the preformatted
 * {@link RecentSaleRow}s the recent-sales table renders, in order. This is the
 * one place raw facts become display strings: cents become dollars, `occurredAt`
 * becomes a relative day plus local time in the sale's store time zone, the line
 * items become the "… + N more" cell summary, and — for the hover breakdown —
 * they are grouped by vendor (each vendor's name with its items' names and
 * prices).
 *
 * `now` is the reference instant the relative day label ("Today", "Yesterday",
 * …) is measured against; callers pass it (from the clock service in production)
 * so the mapping stays a pure, deterministic function of its inputs.
 */
export function toRecentSaleRows(
  sales: readonly RecentSale[],
  now: Date,
): RecentSaleRow[] {
  return sales.map((sale) => ({
    id: sale.id,
    reference: formatReference(sale.id),
    item: formatItemSummary(sale.items),
    vendorGroups: groupItemsByVendor(sale.items),
    time: formatTime(sale.occurredAt, sale.timeZone, now),
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

/**
 * Renders a sale's instant as a relative day label plus its local clock time in
 * the store's time zone, e.g. "Today, 2:14 PM". The day label is measured in the
 * store's own time zone against `now`: the current calendar day is "Today", the
 * one before it "Yesterday", the rest of the past week the weekday name
 * ("Monday"), and anything older a calendar date ("Jun 1", carrying the year
 * "Jun 1, 2023" when it falls outside `now`'s year). Future-dated sales fall
 * through to the same date form.
 */
function formatTime(occurredAt: Date, timeZone: string, now: Date): string {
  const dayLabel = formatDayLabel(occurredAt, timeZone, now);
  const time = timeFormatter(timeZone).format(occurredAt);
  return `${dayLabel}, ${time}`;
}

function formatDayLabel(occurredAt: Date, timeZone: string, now: Date): string {
  const dayDiff = calendarDayDiff(now, occurredAt, timeZone);

  if (dayDiff === 0) {
    return "Today";
  }
  if (dayDiff === 1) {
    return "Yesterday";
  }
  if (dayDiff >= 2 && dayDiff <= 6) {
    return weekdayFormatter(timeZone).format(occurredAt);
  }

  const sameYear =
    zonedDateParts(occurredAt, timeZone).year ===
    zonedDateParts(now, timeZone).year;
  return dateFormatter(timeZone, sameYear).format(occurredAt);
}

/**
 * Whole calendar days from `earlier` to `later` as seen in `timeZone` — 0 when
 * both fall on the same local day, 1 for consecutive days, and so on regardless
 * of the clock time within each day. Negative when `later` is the earlier date.
 */
function calendarDayDiff(later: Date, earlier: Date, timeZone: string): number {
  const laterParts = zonedDateParts(later, timeZone);
  const earlierParts = zonedDateParts(earlier, timeZone);
  const laterMidnight = Date.UTC(
    laterParts.year,
    laterParts.month - 1,
    laterParts.day,
  );
  const earlierMidnight = Date.UTC(
    earlierParts.year,
    earlierParts.month - 1,
    earlierParts.day,
  );
  return Math.round((laterMidnight - earlierMidnight) / MILLIS_PER_DAY);
}

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function zonedDateParts(date: Date, timeZone: string) {
  const parts = dayPartsFormatter(timeZone).formatToParts(date);
  const get = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function timeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function weekdayFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" });
}

function dateFormatter(timeZone: string, sameYear: boolean) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function dayPartsFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatCents(cents: number): string {
  return usdFormatter.format(cents / 100);
}
