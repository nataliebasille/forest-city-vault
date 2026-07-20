import type { Vendor } from "@/lib/vendors/types";

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function priceLabel(vendor: Vendor): string | null {
  if (!vendor.priceRange) {
    return null;
  }
  const { min, max } = vendor.priceRange;
  return min === max ?
      formatPrice(min)
    : `${formatPrice(min)} – ${formatPrice(max)}`;
}

/**
 * Vendor tile for the directory grid.
 *
 * Leads with the vendor name, then surfaces a couple of concrete products so the
 * card reads like a storefront preview rather than a metadata row. When the
 * vendor matched a search, the matched product names are shown (and take
 * priority over generic samples) so the result explains *why* it matched. There
 * is no vendor detail route yet, so the card is intentionally not a link — it
 * gets interactive hover styling without a dead "View vendor" affordance.
 */
export function VendorCard({
  vendor,
  matchedItems = [],
}: {
  vendor: Vendor;
  matchedItems?: string[];
}) {
  const price = priceLabel(vendor);
  const hasMatches = matchedItems.length > 0;
  const products = hasMatches ? matchedItems : vendor.sampleItems.slice(0, 2);

  return (
    <article className="group flex h-full flex-col gap-4 rounded-2xl border border-surface-500/30 bg-surface-50 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500/50 hover:shadow-[0_24px_50px_-30px_rgba(76,70,57,0.65)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-xl leading-snug text-secondary-500">
          {vendor.name}
        </h3>
        <span className="shrink-0 rounded-full border border-surface-500/40 px-2.5 py-1 font-subheading text-xs text-secondary-500/80">
          {vendor.itemCount} {vendor.itemCount === 1 ? "item" : "items"}
        </span>
      </div>

      {products.length > 0 ?
        <p className="font-body text-sm text-on-surface-50/80">
          <span className="font-subheading text-xs font-semibold tracking-wide text-primary-500 uppercase">
            {hasMatches ? "Matches" : "Featured"}
          </span>
          <span className="mt-1 block text-secondary-500/90">
            {products.join(", ")}
          </span>
        </p>
      : null}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-surface-500/20 pt-3">
        {price ?
          <span className="font-subheading text-sm font-semibold text-primary-500">
            {price}
          </span>
        : <span className="font-subheading text-sm text-secondary-500/60">
            Ohio City vendor
          </span>
        }
      </div>
    </article>
  );
}
