export type PriceRange = {
  min: number;
  max: number;
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
