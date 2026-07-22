export type PriceRange = {
  min: number;
  max: number;
};

/** A single product (Clover item) attributed to a vendor. */
export type Product = {
  /** Display name of the item. */
  name: string;
  /** Item price in dollars, or null when unpriced / "ask in store". */
  price: number | null;
};

export type Vendor = {
  /** Display name, taken from the Clover category name. */
  name: string;
  /** URL-safe identifier derived from the name. */
  slug: string;
  /**
   * Precomputed, normalized bag of search terms (vendor name + item names).
   * Lowercased, diacritic-stripped, de-duplicated tokens joined by spaces so a
   * search only has to run cheap substring/token checks against this one field
   * instead of re-scanning every item at query time.
   */
  searchKey: string;
  /** Number of visible items attributed to this vendor. */
  itemCount: number;
  /** Price span across the vendor's priced items, or null when unknown. */
  priceRange: PriceRange | null;
  /** A few example item names, for display on cards. */
  sampleItems: string[];
  /**
   * All unique item names for this vendor. Server-side only — used to rank
   * search matches and to surface *which* products matched a query. Never sent
   * to the browser wholesale; the UI renders at most a couple of matched names.
   */
  items: string[];
  /**
   * The vendor's full product collection (name + price), de-duplicated by name.
   * Surfaced on the vendor detail page (`/vendors/[slug]`).
   */
  products: Product[];
};

export type VendorData = {
  /** ISO timestamp of when vendors.json was generated. */
  generatedAt: string;
  /** Source workbook the data was derived from. */
  source: string;
  /** Number of vendors. */
  count: number;
  vendors: Vendor[];
};
