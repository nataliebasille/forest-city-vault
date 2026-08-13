import type { VendorListRow } from "./vendors-list";
import type { VendorView } from "./vendor-view";

/**
 * Maps the {@link VendorListRow}s from the read model onto the {@link VendorView}
 * shape the client workspace renders. Real fields (name, status, Clover category,
 * items) pass through; `tags`, `contact`, and `pricingModel` have no domain
 * column yet, so they map to defaults. Every loaded item is `synced` — the other
 * sync states only arise from local, not-yet-persisted edits.
 */
export function toVendorViews(rows: readonly VendorListRow[]): VendorView[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    tags: "",
    pricingModel: "consignment" as const,
    status: row.status,
    cloverCategoryId: row.cloverCategoryId,
    contact: "",
    updatedAt: formatUpdatedAt(row.updatedAt),
    items: row.items.map((item) => ({
      id: item.cloverItemId,
      cloverItemId: item.cloverItemId,
      name: item.name,
      priceCents: item.priceCents,
      syncState: "synced" as const,
    })),
  }));
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatUpdatedAt(date: Date): string {
  return dateFormatter.format(date);
}
