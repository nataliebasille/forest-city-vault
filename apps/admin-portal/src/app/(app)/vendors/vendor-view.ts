// View model + pure helpers for the vendor management page, shared by the server
// view-mapper and the client workspace component. No React and no server imports
// so it is safe on both sides.
//
// NOTE: `tags`, `contact`, and `pricingModel` have no backing column in the
// `Vendor` domain yet; they are kept on the view so the UI can render them, but
// the mapper currently supplies defaults for them.

export type VendorStatus = "active" | "inactive";

/**
 * How the store carries a vendor's goods: `consignment` (vendor keeps ownership;
 * store takes a commission on sale) or `wholesale` (store buys the stock outright).
 * No domain column yet, so the mapper defaults it and edits are not persisted.
 */
export type PricingModel = "consignment" | "wholesale";

/**
 * Per-item bookkeeping for the "sync back to Clover" flow. Items loaded from the
 * database are always `synced`; the other states are produced locally as the user
 * edits (mutations are not persisted yet).
 */
export type ItemSyncState = "synced" | "edited" | "new" | "removed";

export type ItemView = {
  id: string;
  cloverItemId: string | null;
  name: string;
  priceCents: number;
  syncState: ItemSyncState;
};

export type VendorView = {
  id: string;
  name: string;
  tags: string;
  pricingModel: PricingModel;
  status: VendorStatus;
  /** Clover category linkage — null until linked. */
  cloverCategoryId: string | null;
  items: ItemView[];
  contact: string;
  updatedAt: string;
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format integer cents as USD, e.g. 2450 -> "$24.50". */
export function formatDollars(cents: number): string {
  return usd.format(cents / 100);
}

/** Parse a dollar string (e.g. "24.50" or "$24.5") into integer cents. */
export function parseDollars(input: string): number {
  const n = Number(input.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** How many of a vendor's items still need to sync back to Clover. */
export function unsyncedCount(vendor: VendorView): number {
  return vendor.items.filter((i) => i.syncState !== "synced").length;
}

let itemSeq = 0;
/** A fresh blank item for "add item" flows (client-only, non-persisting). */
export function blankItem(): ItemView {
  itemSeq += 1;
  return {
    id: `LI-${itemSeq}-${Math.random().toString(36).slice(2, 6)}`,
    cloverItemId: null,
    name: "",
    priceCents: 0,
    syncState: "new",
  };
}

/** A fresh blank vendor for "add" flows (client-only, non-persisting). */
export function blankVendor(): VendorView {
  return {
    id: `V-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    name: "",
    tags: "",
    pricingModel: "consignment",
    status: "active",
    cloverCategoryId: null,
    items: [],
    contact: "",
    updatedAt: "just now",
  };
}
