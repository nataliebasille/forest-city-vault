import { formatPrice } from "@/lib/vendors/format";
import type { Product } from "@/lib/vendors/types";

/** First character of the product name, used as the placeholder monogram. */
function monogram(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

// Warm parchment gradient for the image placeholder; matches the vendor cards
// and stands in for real product photography until it lands.
const PLACEHOLDER_BACKGROUND =
  "radial-gradient(circle at 85% 115%, rgba(175,95,29,0.30) 0%, transparent 55%)," +
  "radial-gradient(circle at 15% -15%, rgba(190,153,109,0.28) 0%, transparent 55%)," +
  "#faf4ec";

/**
 * A single product tile for the vendor collection grid.
 *
 * Structured like the featured vendor cards so the grid stays aligned: a short
 * 16:9 image area on top (a gradient placeholder with a small monogram until real
 * product photography exists), then a compact content block whose name is clamped
 * to two lines and whose price is pinned to the footer with `mt-auto`. That keeps
 * every card the same height with the price on a shared baseline. Presentational
 * only — there is no per-product detail route yet.
 */
export function VendorProductCard({ product }: { product: Product }) {
  return (
    <article className="group/product flex h-full flex-col overflow-hidden rounded-xl border border-surface-500/30 bg-surface-50 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500/40 hover:shadow-[0_16px_35px_-28px_rgba(76,70,57,0.6)]">
      <div
        className="relative flex aspect-[16/9] items-center justify-center"
        style={{ background: PLACEHOLDER_BACKGROUND }}
      >
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl font-heading text-xl text-surface-50 shadow-[0_2px_8px_rgba(175,95,29,0.35)]"
          style={{
            background: "linear-gradient(135deg, #af5f1d 0%, #c97028 100%)",
          }}
          aria-hidden="true"
        >
          {monogram(product.name)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] font-heading text-base leading-snug text-secondary-500">
          {product.name}
        </h3>

        <div className="mt-auto">
          {product.price !== null ?
            <span className="font-subheading text-base font-semibold text-primary-500">
              {formatPrice(product.price)}
            </span>
          : <span className="font-subheading text-sm text-secondary-500/70">
              Ask in store
            </span>
          }
        </div>
      </div>
    </article>
  );
}
