import { normalizeText, tokenize } from "./normalize";
import type { Vendor } from "./types";

/** A vendor that matched a query, with the product names that explain the hit. */
export type VendorMatch = {
  vendor: Vendor;
  /** Item names that matched the query, for the "Matches: …" card hint. */
  matchedItems: string[];
};

/** Number of matched product names surfaced on a card. */
const MAX_MATCHED_ITEMS = 3;

// Relevance tiers, highest first. A vendor's score is the best tier it reaches.
const SCORE_NAME_EXACT = 5;
const SCORE_NAME_PREFIX = 4;
const SCORE_NAME_WORD = 3;
const SCORE_PRODUCT = 2;
const SCORE_OTHER = 1;

/**
 * Score a single vendor against a normalized query. Returns `0` when the vendor
 * does not match (every query token must appear somewhere in its `searchKey`,
 * preserving the original AND semantics) so the caller can drop it.
 */
function scoreVendor(
  vendor: Vendor,
  normalizedQuery: string,
  terms: string[],
): number {
  // AND semantics: skip vendors missing any query token.
  if (!terms.every((term) => vendor.searchKey.includes(term))) {
    return 0;
  }

  const name = normalizeText(vendor.name);
  const nameWords = name ? name.split(" ") : [];

  if (name === normalizedQuery) {
    return SCORE_NAME_EXACT;
  }
  if (name.startsWith(normalizedQuery)) {
    return SCORE_NAME_PREFIX;
  }
  if (terms.every((term) => nameWords.includes(term))) {
    return SCORE_NAME_WORD;
  }
  if (
    vendor.items.some((item) => normalizeText(item).includes(normalizedQuery))
  ) {
    return SCORE_PRODUCT;
  }
  return SCORE_OTHER;
}

/** Collect the item names that match the query, capped for display. */
function collectMatchedItems(vendor: Vendor, terms: string[]): string[] {
  const matched: string[] = [];
  for (const item of vendor.items) {
    const normalized = normalizeText(item);
    if (terms.every((term) => normalized.includes(term))) {
      matched.push(item);
      if (matched.length === MAX_MATCHED_ITEMS) {
        break;
      }
    }
  }
  return matched;
}

/**
 * Rank vendors against a free-text query.
 *
 * The query is normalized into tokens; a vendor is included only when every
 * token appears in its precomputed `searchKey` (AND semantics, as before), then
 * results are ordered by relevance:
 *
 *   1. exact vendor-name match
 *   2. vendor-name prefix match
 *   3. vendor-name word match
 *   4. product-name / category match
 *   5. other substring match
 *
 * Ties fall back to alphabetical order. An empty query returns every vendor in
 * the incoming (alphabetical) order with no matched items. The heavy lifting
 * (normalizing item names) happened at build time, so this stays cheap.
 */
export function searchVendors(vendors: Vendor[], query: string): VendorMatch[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return vendors.map((vendor) => ({ vendor, matchedItems: [] }));
  }

  const normalizedQuery = normalizeText(query);

  return vendors
    .map((vendor) => ({
      vendor,
      score: scoreVendor(vendor, normalizedQuery, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.vendor.name.localeCompare(b.vendor.name),
    )
    .map(({ vendor }) => ({
      vendor,
      matchedItems: collectMatchedItems(vendor, terms),
    }));
}
