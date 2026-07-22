import { Effect } from "effect";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { getFeaturedVendors } from "@/lib/vendors/data";
import type { Vendor } from "@/lib/vendors/types";
import { type FeaturedVendor, FeaturedVendorCard } from "./FeaturedVendorCard";
import { RotatingVendorCarousel } from "./RotatingVendorCarousel";

// TODO(temporary-image): Every featured vendor currently reuses the single
// existing marketplace photo (`/images/fvc-hero.jpeg`). Swap for dedicated
// vendor/product photography when it lands.
const PLACEHOLDER_IMAGE = "/images/fvc-hero.jpeg";

/**
 * Homepage "Featured in the Vault" section. Server component: it runs the cached
 * {@link getFeaturedVendors} Effect to pick a rotating set of *real* workbook
 * vendors, so each card's "View their collection" link resolves to that vendor's
 * `/vendors/[slug]` page. Falls back to rendering nothing if the vendor data is
 * unavailable, so a data hiccup never breaks the homepage.
 */
export async function FeaturedVendors() {
  const vendors = await Effect.runPromise(
    getFeaturedVendors.pipe(Effect.orElseSucceed(() => [] as Vendor[])),
  );
  const featured = vendors.map(toFeaturedVendor);

  if (featured.length === 0) {
    return null;
  }

  return (
    <section
      id="vendors"
      aria-labelledby="featured-vendors-heading"
      className="border-t border-surface-500/25 bg-surface-50 py-16 md:py-20"
    >
      <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
              Featured in the Vault
            </p>
            <h2
              id="featured-vendors-heading"
              className="font-heading text-3xl leading-tight text-secondary-500 sm:text-4xl lg:text-5xl"
            >
              Meet a few of the independent vendors inside.
            </h2>
          </div>

          {/* Links to the full vendor directory. */}
          <Link
            href="/vendors"
            className="group/browse hidden w-fit shrink-0 items-center gap-1.5 font-subheading text-sm font-semibold text-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 md:inline-flex"
          >
            <span className="nav-underline">Browse all vendors</span>
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 ease-out group-hover/browse:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-8">
          {/* Mobile: auto-rotating carousel. Desktop/tablet: static grid. */}
          <RotatingVendorCarousel
            vendors={featured}
            label="Featured vendors"
            className="md:hidden"
          />

          <div className="hidden flex-col gap-4 md:flex">
            <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
              Featured vendors
            </p>
            <ul className="grid grid-cols-3 gap-6">
              {featured.map((vendor) => (
                <li key={vendor.slug} className="group">
                  <FeaturedVendorCard vendor={vendor} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Mobile-only copy of the directory link. */}
        <Link
          href="/vendors"
          className="group/browse mt-6 inline-flex w-fit items-center gap-1.5 font-subheading text-sm font-semibold text-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 md:hidden"
        >
          <span className="nav-underline">Browse all vendors</span>
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 ease-out group-hover/browse:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}

/**
 * Adapt a workbook-derived {@link Vendor} into the {@link FeaturedVendor} card
 * shape. Real vendors have no curated description, imagery, or categories yet, so
 * we derive a "Known for …" blurb from sample items and reuse the shared
 * marketplace photo. The important part is the `slug`, which now matches the
 * directory/detail route so "View their collection" resolves.
 */
function toFeaturedVendor(vendor: Vendor): FeaturedVendor {
  return {
    name: vendor.name,
    slug: vendor.slug,
    description: describeVendor(vendor),
    imageSrc: PLACEHOLDER_IMAGE,
    imageAlt: `A selection of products from ${vendor.name} at the Forest City Vault marketplace`,
    categories: [],
  };
}

/** Short blurb derived from a vendor's sample items. */
function describeVendor(vendor: Vendor): string {
  const highlights = vendor.sampleItems.slice(0, 3);
  if (highlights.length === 0) {
    return "An independent vendor inside the Vault.";
  }
  return `Known for ${highlights.join(", ")}.`;
}
