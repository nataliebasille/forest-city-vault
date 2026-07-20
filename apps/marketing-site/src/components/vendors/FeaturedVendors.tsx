import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { FeaturedVendorCard, type FeaturedVendor } from "./FeaturedVendorCard";
import { NewThisWeekSpotlight } from "./NewThisWeekSpotlight";
import { RotatingVendorCarousel } from "./RotatingVendorCarousel";

// TODO(temporary-image): Every vendor currently reuses the single existing
// marketplace photo (`/images/fvc-hero.jpeg`) with a different crop position.
// Swap each `imageSrc` for dedicated vendor/product/booth photography when it
// lands, and drop the `imagePosition` crop hints in FeaturedVendorCard.
const FEATURED_VENDORS: FeaturedVendor[] = [
  {
    name: "Rust Belt Revival",
    slug: "rust-belt-revival",
    description: "Vintage furniture and decor with soul.",
    imageSrc: "/images/fvc-hero.jpeg",
    imageAlt:
      "A styled arrangement of vintage furniture and decor inside the Forest City Vault marketplace",
    imagePosition: "center 30%",
    categories: ["Vintage", "Home goods"],
  },
  {
    name: "Modern Relics",
    slug: "modern-relics",
    description: "Curated vintage jewelry and accessories.",
    imageSrc: "/images/fvc-hero.jpeg",
    imageAlt:
      "A curated display of vintage jewelry and accessories at the Forest City Vault marketplace",
    imagePosition: "left center",
    categories: ["Jewelry", "Vintage"],
    isNew: true,
  },
  {
    name: "Reside Art Studio",
    slug: "reside-art-studio",
    description: "Original prints and paintings by local artists.",
    imageSrc: "/images/fvc-hero.jpeg",
    imageAlt:
      "Original prints and paintings by local artists shown at the Forest City Vault marketplace",
    imagePosition: "right center",
    categories: ["Art", "Home goods"],
    isNew: true,
  },
  {
    name: "Field & Thread",
    slug: "field-and-thread",
    description: "Thoughtful apparel and goods for everyday life.",
    imageSrc: "/images/fvc-hero.jpeg",
    imageAlt:
      "Thoughtfully made apparel and everyday goods displayed at the Forest City Vault marketplace",
    imagePosition: "center 70%",
    categories: ["Apparel", "Lifestyle"],
    isNew: true,
  },
  {
    name: "Hearth & Hand",
    slug: "hearth-and-hand",
    description: "Handmade home goods for cozy living.",
    imageSrc: "/images/fvc-hero.jpeg",
    imageAlt:
      "Handmade home goods for cozy living arranged at the Forest City Vault marketplace",
    imagePosition: "center 85%",
    categories: ["Home goods", "Gifts"],
  },
  {
    name: "Paper Crane Press",
    slug: "paper-crane-press",
    description: "Hand-pressed cards, prints, and paper goods.",
    imageSrc: "/images/fvc-hero.jpeg",
    imageAlt:
      "Hand-pressed cards, prints, and paper goods displayed at the Forest City Vault marketplace",
    imagePosition: "left top",
    categories: ["Art", "Gifts"],
  },
];

const NEW_VENDORS = FEATURED_VENDORS.filter((vendor) => vendor.isNew);
const OTHER_VENDORS = FEATURED_VENDORS.filter((vendor) => !vendor.isNew);

export function FeaturedVendors() {
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

        <div className="mt-8 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,2fr)] lg:gap-10">
          {NEW_VENDORS.length > 0 ?
            <NewThisWeekSpotlight vendors={NEW_VENDORS} />
          : null}

          {/* Vertical divider — separates the rotating spotlight from the
              featured vendors on desktop; collapses to a top border when
              stacked. */}
          {NEW_VENDORS.length > 0 ?
            <div
              aria-hidden="true"
              className="hidden bg-surface-500/25 lg:block"
            />
          : null}

          <div
            className={
              NEW_VENDORS.length > 0 ?
                "min-w-0 border-t border-surface-500/20 pt-8 lg:border-t-0 lg:pt-0"
              : "min-w-0"
            }
          >
            {/* Mobile: auto-rotating carousel. Desktop/tablet: static grid. */}
            <RotatingVendorCarousel
              vendors={OTHER_VENDORS}
              label="Featured vendors"
              className="md:hidden"
            />

            <div className="hidden flex-col gap-4 md:flex">
              <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
                Featured vendors
              </p>
              <ul className="grid grid-cols-3 gap-6">
                {OTHER_VENDORS.map((vendor) => (
                  <li key={vendor.slug} className="group">
                    <FeaturedVendorCard vendor={vendor} />
                  </li>
                ))}
              </ul>
            </div>
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
