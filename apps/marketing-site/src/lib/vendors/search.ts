import { tokenize } from "./normalize";
import type { Vendor } from "./types";

/**
 * Filter vendors by a free-text query using their precomputed `searchKey`.
 *
 * The query is normalized into tokens and a vendor matches when *every* token
 * appears as a substring of its `searchKey` (AND semantics). Because the heavy
 * lifting — normalizing and flattening every item name — happened at build
 * time, each match is just a handful of `String.includes` checks.
 */
export function searchVendors(vendors: Vendor[], query: string): Vendor[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return vendors;
  }
  return vendors.filter((vendor) =>
    terms.every((term) => vendor.searchKey.includes(term)),
  );
}
