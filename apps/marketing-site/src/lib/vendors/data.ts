import { Effect } from "effect";
import { unstable_cache } from "next/cache";
import { buildVendorData, VendorDataError } from "./build-vendors";
import { selectFeaturedVendors } from "./featured";
import type { Vendor, VendorData } from "./types";

/**
 * Internal "Promise island": `unstable_cache` needs a
 * `() => Promise<serializable>`, so we run the `buildVendorData` Effect to a
 * plain `VendorData` with `Effect.runPromise` *inside* the cached callback.
 *
 * `revalidate: false` persists the parsed result in Next.js' built-in cache
 * across requests and deployments. Because `/vendors` is statically
 * prerendered, the workbook is parsed a single time at build and reused
 * forever — it never expires on a timer. Invalidate on demand with
 * `revalidateTag("vendors")` (e.g. after uploading a new workbook).
 */
const vendorDataCache = unstable_cache(
  (): Promise<VendorData> => Effect.runPromise(buildVendorData),
  ["vendors"],
  { revalidate: false, tags: ["vendors"] },
);

/**
 * Vendor data, produced by parsing `vendor-data.xlsx` and cached
 * **indefinitely**.
 *
 * Effect stays on both ends: the parsing is an Effect ({@link buildVendorData})
 * and so is this public value. In between, `unstable_cache` can only speak
 * Promises, so we bridge across it — `runPromise` on the way *in* (see
 * {@link vendorDataCache}) and `Effect.tryPromise` on the way *out* here. The
 * typed error channel can't survive the cache boundary, so any rejection is
 * re-tagged back into a {@link VendorDataError} (passing the original through
 * when it already is one).
 */
export const getVendorData: Effect.Effect<VendorData, VendorDataError> =
  Effect.tryPromise({
    try: () => vendorDataCache(),
    catch: (cause) =>
      cause instanceof VendorDataError ? cause : new VendorDataError({ cause }),
  });

/** All vendors, sorted by name. */
export const getVendors: Effect.Effect<Vendor[], VendorDataError> = Effect.map(
  getVendorData,
  ({ vendors }) => vendors,
);

/**
 * A single vendor by slug, or `undefined` when no vendor matches. Derived from
 * the same indefinitely-cached {@link getVendorData}, so the vendor detail page
 * shares the one workbook parse with the directory.
 */
export const getVendorBySlug = (
  slug: string,
): Effect.Effect<Vendor | undefined, VendorDataError> =>
  Effect.map(getVendors, (vendors) =>
    vendors.find((vendor) => vendor.slug === slug),
  );

const FEATURED_COUNT = 3;
const FOUR_HOURS_IN_SECONDS = 60 * 60 * 4;

/**
 * Internal Promise island for featured vendors (see {@link vendorDataCache}).
 * The random selection runs once per cache window and is reused for every
 * request until the cache revalidates.
 */
const featuredVendorsCache = unstable_cache(
  (): Promise<Vendor[]> =>
    Effect.runPromise(
      Effect.map(buildVendorData, ({ vendors }) =>
        selectFeaturedVendors(vendors, { count: FEATURED_COUNT }),
      ),
    ),
  ["featured-vendors"],
  { revalidate: FOUR_HOURS_IN_SECONDS, tags: ["featured-vendors", "vendors"] },
);

/**
 * A rotating set of featured vendors, cached for ~4 hours.
 *
 * All visitors see the same featured vendors within a window. To bias against
 * repeats, pass the previous window's slugs as `recentlyFeatured` once that
 * history is persisted (see `selectFeaturedVendors`); it is intentionally
 * omitted for now.
 */
export const getFeaturedVendors: Effect.Effect<Vendor[], VendorDataError> =
  Effect.tryPromise({
    try: () => featuredVendorsCache(),
    catch: (cause) =>
      cause instanceof VendorDataError ? cause : new VendorDataError({ cause }),
  });
