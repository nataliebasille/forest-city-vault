import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { priceRangeLabel } from "@/lib/vendors/format";
import type { PriceRange } from "@/lib/vendors/types";

/**
 * The single vendor tile used everywhere vendors are shown: the homepage
 * "Featured in the Vault" section and the directory/search grid.
 *
 * It adapts to the data it is given rather than the place it renders:
 *
 *   - **Media** — a photo when `imageSrc` is set (homepage), otherwise a
 *     gradient identity band with a monogram avatar so photo-less workbook
 *     vendors still get a distinct visual anchor. An optional `badge` overlays
 *     either.
 *   - **Detail** — the most specific thing available: matched-item pills when a
 *     search produced `matchedItems`, else an editorial `description`, else a
 *     "Known for" list of `sampleItems`. Curated `categories` render as pills
 *     beneath.
 *   - **Footer** — price range (or "Ask in store") and item count, shown only
 *     when that data exists.
 *
 * The whole card links to the vendor's collection page at `/vendors/[slug]`.
 */
export type VendorCardVendor = {
  name: string;
  slug: string;
  imageSrc?: string;
  imageAlt?: string;
  imagePosition?: string;
  badge?: string;
  description?: string;
  categories?: readonly string[];
  sampleItems?: readonly string[];
  priceRange?: PriceRange | null;
  itemCount?: number;
};

export function VendorCard({
  vendor,
  matchedItems = [],
  // When true, the media stretches to fill leftover vertical space instead of
  // using a fixed aspect ratio. Used by the mobile carousel so its card height
  // matches an adjacent column rather than scaling with its width.
  fillHeight = false,
}: {
  vendor: VendorCardVendor;
  matchedItems?: string[];
  fillHeight?: boolean;
}) {
  const hasMatches = matchedItems.length > 0;
  const price = priceRangeLabel(vendor.priceRange ?? null);
  const hasItemCount = typeof vendor.itemCount === "number";
  const hasFooter = Boolean(price) || hasItemCount;
  const categories = vendor.categories ?? [];
  const sampleItems = (vendor.sampleItems ?? []).slice(0, 2);

  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      aria-label={`View ${vendor.name}'s collection`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-surface-500/30 bg-surface-50 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500/50 hover:shadow-[0_24px_50px_-30px_rgba(76,70,57,0.65)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    >
      {vendor.imageSrc ?
        <div
          className={cn(
            "relative w-full overflow-hidden",
            fillHeight ?
              "aspect-[4/3] lg:aspect-auto lg:min-h-0 lg:flex-1"
            : "aspect-[4/3]",
          )}
        >
          <Image
            src={vendor.imageSrc}
            alt={vendor.imageAlt ?? ""}
            fill
            sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 30vw, (min-width: 768px) 45vw, 85vw"
            style={{ objectPosition: vendor.imagePosition }}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
          {vendor.badge ?
            <span className="absolute top-3 left-3 rounded-md bg-primary-500 px-2.5 py-1 font-subheading text-[0.65rem] font-semibold tracking-[0.12em] text-on-primary-500 uppercase shadow-sm">
              {vendor.badge}
            </span>
          : null}
        </div>
      : <div
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] font-heading text-xl text-white shadow-[0_2px_8px_rgba(175,95,29,0.35)]"
            style={{
              background: "linear-gradient(135deg, #af5f1d 0%, #c97028 100%)",
            }}
            aria-hidden="true"
          >
            {monogram(vendor.name)}
          </span>
          {vendor.badge ?
            <span className="absolute top-3 right-3 rounded-md bg-primary-500 px-2.5 py-1 font-subheading text-[0.65rem] font-semibold tracking-[0.12em] text-on-primary-500 uppercase shadow-sm">
              {vendor.badge}
            </span>
          : null}
        </div>
      }

      <div className="flex flex-1 flex-col px-5 pt-4">
        <h3 className="font-heading text-2xl leading-tight text-ink">
          {vendor.name}
        </h3>

        <div className="mt-3 mb-5 flex flex-col gap-3">
          {hasMatches ?
            <div>
              <span className="font-subheading text-xs font-semibold tracking-[0.12em] text-primary-500 uppercase">
                Matches your search
              </span>
              <ul className="mt-2 flex flex-wrap gap-2">
                {matchedItems.map((item) => (
                  <li
                    key={item}
                    className="rounded-lg border border-surface-500/30 bg-surface-50 px-3 py-1 font-body text-sm text-ink/90"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          : vendor.description ?
            <p className="font-body text-sm/6 text-on-surface-50/80">
              {vendor.description}
            </p>
          : sampleItems.length > 0 ?
            <div>
              <span className="font-subheading text-xs font-semibold tracking-[0.12em] text-primary-500 uppercase">
                Known for
              </span>
              <p className="mt-1 font-body text-sm text-on-surface-50/80">
                {sampleItems.join(", ")}
              </p>
            </div>
          : null}

          {categories.length > 0 ?
            <ul className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <li
                  key={category}
                  className="rounded-md border border-surface-500/40 px-2.5 py-1 font-subheading text-xs text-ink/80"
                >
                  {category}
                </li>
              ))}
            </ul>
          : null}
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-t border-surface-500/20 pt-4 pb-5">
          {hasFooter ?
            <div className="flex min-w-0 flex-col gap-0.5">
              {price ?
                <span className="font-subheading text-lg font-semibold whitespace-nowrap text-primary-500">
                  {price}
                </span>
              : <span className="font-subheading text-sm text-ink/70">
                  Ask in store
                </span>
              }
              {hasItemCount ?
                <span className="font-body text-xs text-ink/50">
                  {vendor.itemCount} {vendor.itemCount === 1 ? "item" : "items"}{" "}
                  available
                </span>
              : null}
            </div>
          : <span />}

          <span
            className="flex shrink-0 items-center gap-1.5 font-subheading text-xs font-bold tracking-[0.06em] text-primary-500 uppercase transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            View collection
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
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
  "var(--color-surface-100)";
