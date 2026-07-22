import { ArrowRightIcon } from "@/components/icons";
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

/** First character of the vendor name, used as the avatar monogram. */
function monogram(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

// Warm parchment gradient for the identity band; evokes a market-stall awning.
const BAND_BACKGROUND =
  "radial-gradient(circle at 90% 120%, rgba(175,95,29,0.35) 0%, transparent 55%)," +
  "radial-gradient(circle at -10% -20%, rgba(190,153,109,0.25) 0%, transparent 55%)," +
  "#faf4ec";

/**
 * Vendor tile for the directory grid.
 *
 * The card opens with a gradient identity band and a monogram avatar so each
 * vendor has a distinct visual anchor. The default (browsing) state surfaces a
 * few sample products under a "Known for" label; the search state swaps that for
 * explicit matched-item pills under "Matches your search" so a result explains
 * why it matched. A price range and item count anchor the footer, and a "Browse"
 * affordance slides in on hover. There is no vendor detail route yet, so the
 * card is intentionally not a link.
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
  const featuredProducts = vendor.sampleItems.slice(0, 2);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-surface-500/30 bg-surface-50 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500/50 hover:shadow-[0_24px_50px_-30px_rgba(76,70,57,0.65)]">
      <div
        className="relative flex h-[88px] items-end px-5 pb-4"
        style={{ background: BAND_BACKGROUND }}
      >
        <span
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg, #af5f1d 0%, #be996d 60%, transparent 100%)",
            opacity: 0.75,
          }}
        />
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] font-heading text-xl text-surface-50 shadow-[0_2px_8px_rgba(175,95,29,0.35)]"
          style={{
            background: "linear-gradient(135deg, #af5f1d 0%, #c97028 100%)",
          }}
          aria-hidden="true"
        >
          {monogram(vendor.name)}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 pt-4">
        <h3 className="font-heading text-2xl leading-tight text-secondary-500">
          {vendor.name}
        </h3>

        {hasMatches ?
          <div className="mt-3 mb-5">
            <span className="font-subheading text-xs font-semibold tracking-[0.12em] text-primary-500 uppercase">
              Matches your search
            </span>
            <ul className="mt-2 flex flex-wrap gap-2">
              {matchedItems.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-surface-500/30 bg-surface-50 px-3 py-1 font-body text-sm text-secondary-500/90"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        : <div className="mt-3 mb-5">
            <span className="font-subheading text-xs font-semibold tracking-[0.12em] text-primary-500 uppercase">
              Known for
            </span>
            {featuredProducts.length > 0 ?
              <p className="mt-1 font-body text-sm text-on-surface-50/80">
                {featuredProducts.join(", ")}
              </p>
            : null}
          </div>
        }

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-surface-500/20 pt-4 pb-5">
          <div className="flex flex-col gap-0.5">
            {price ?
              <span className="font-subheading text-lg font-semibold text-primary-500">
                {price}
              </span>
            : <span className="font-subheading text-sm text-secondary-500/70">
                Ask in store
              </span>
            }
            <span className="font-body text-xs text-secondary-500/50">
              {vendor.itemCount} {vendor.itemCount === 1 ? "item" : "items"}{" "}
              available
            </span>
          </div>

          <span
            className="flex -translate-x-1.5 items-center gap-1.5 font-subheading text-xs font-bold tracking-[0.06em] text-primary-500 uppercase opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
            aria-hidden="true"
          >
            Browse
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </article>
  );
}
