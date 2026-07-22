import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { priceRangeLabel } from "@/lib/vendors/format";
import type { Vendor } from "@/lib/vendors/types";

/** First character of the vendor name, used as the avatar monogram. */
function monogram(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

// Warm parchment gradient for the identity band; mirrors the directory card.
const BAND_BACKGROUND =
  "radial-gradient(circle at 90% 120%, rgba(175,95,29,0.35) 0%, transparent 55%)," +
  "radial-gradient(circle at -10% -20%, rgba(190,153,109,0.25) 0%, transparent 55%)," +
  "#faf4ec";

/**
 * Vendor detail shell for `/vendors/[slug]`. Opens with a back link to the
 * directory and a vendor header (monogram, name, price range, item count), then
 * renders the vendor's product collection passed in as `children`.
 */
export function VendorProfile({
  vendor,
  children,
}: {
  vendor: Vendor;
  children: React.ReactNode;
}) {
  const price = priceRangeLabel(vendor.priceRange);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10 md:py-12">
      <Link
        href="/vendors"
        className="nav-link inline-flex items-center gap-1.5 font-subheading text-sm font-semibold text-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        <span className="nav-underline">Back to all vendors</span>
      </Link>

      <header
        className="relative mt-6 overflow-hidden rounded-2xl border border-surface-500/30"
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
        <div className="flex flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:gap-5 md:px-8">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-heading text-3xl text-surface-50 shadow-[0_2px_8px_rgba(175,95,29,0.35)]"
            style={{
              background: "linear-gradient(135deg, #af5f1d 0%, #c97028 100%)",
            }}
            aria-hidden="true"
          >
            {monogram(vendor.name)}
          </span>
          <div className="space-y-1">
            <p className="font-subheading text-xs font-semibold tracking-[0.24em] text-primary-500 uppercase">
              Vendor Collection
            </p>
            <h1 className="font-heading text-3xl leading-tight text-secondary-500 sm:text-4xl">
              {vendor.name}
            </h1>
            <p className="font-body text-sm text-secondary-500/70">
              {vendor.itemCount} {vendor.itemCount === 1 ? "item" : "items"}
              {price ? ` · ${price}` : null}
            </p>
          </div>
        </div>
      </header>

      <section aria-label="Products" className="mt-8">
        {children}
      </section>
    </div>
  );
}
