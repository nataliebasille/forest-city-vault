/**
 * Discovery categories used by the directory chips and the homepage hero.
 *
 * These are curated browsing terms (not Clover categories — those map to vendor
 * names). Selecting a chip searches the directory with the term as the query,
 * e.g. `/vendors?q=jewelry`.
 */
export const VENDOR_CATEGORIES = [
  "Vintage",
  "Jewelry",
  "Art",
  "Apparel",
  "Home goods",
  "Gifts",
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

/** The query string a category chip applies (lowercased category label). */
export function categoryQuery(category: string): string {
  return category.toLowerCase();
}

/** Href for a category chip / homepage link, e.g. `/vendors?q=jewelry`. */
export function categoryHref(category: string): string {
  return `/vendors?q=${encodeURIComponent(categoryQuery(category))}`;
}
