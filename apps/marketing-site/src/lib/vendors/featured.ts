import type { Vendor } from "./types";

export type FeaturedOptions = {
  /** How many vendors to feature. Defaults to 3. */
  count?: number;
  /**
   * Random source in [0, 1). Injectable so the selection can be made
   * deterministic in tests. Defaults to `Math.random`.
   */
  random?: () => number;
  /**
   * Slugs of vendors featured in recent rotations. These are down-weighted so
   * the same vendors are less likely to be picked again back-to-back.
   */
  recentlyFeatured?: string[];
  /**
   * Weight multiplier applied to recently-featured vendors (0 excludes them
   * entirely, 1 disables the penalty). Defaults to 0.25.
   */
  recentPenalty?: number;
};

/**
 * Pick `count` distinct featured vendors using weighted sampling without
 * replacement.
 *
 * Every vendor starts with weight 1. Vendors listed in `recentlyFeatured` are
 * multiplied by `recentPenalty`, making them proportionally less likely to be
 * chosen again while still keeping them in the pool. Callers persist the
 * "recently featured" history; this function stays pure so it is trivial to
 * test and cache.
 */
export function selectFeaturedVendors(
  vendors: Vendor[],
  options: FeaturedOptions = {},
): Vendor[] {
  const {
    count = 3,
    random = Math.random,
    recentlyFeatured = [],
    recentPenalty = 0.25,
  } = options;

  const recent = new Set(recentlyFeatured);
  const pool = vendors.map((vendor) => ({
    vendor,
    weight: recent.has(vendor.slug) ? recentPenalty : 1,
  }));

  const picked: Vendor[] = [];
  const target = Math.min(count, pool.length);

  for (let i = 0; i < target; i++) {
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) {
      break;
    }

    let threshold = random() * totalWeight;
    let index = 0;
    for (; index < pool.length - 1; index++) {
      threshold -= pool[index].weight;
      if (threshold <= 0) {
        break;
      }
    }

    picked.push(pool[index].vendor);
    pool.splice(index, 1);
  }

  return picked;
}
