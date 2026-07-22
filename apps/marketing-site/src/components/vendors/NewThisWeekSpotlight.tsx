import { RotatingVendorCarousel } from "./RotatingVendorCarousel";
import type { VendorCardVendor } from "./VendorCard";

/**
 * Homepage "New this week" spotlight column. A single rotating {@link VendorCard}
 * that stretches (`fillHeight`) to match the height of the featured grid beside
 * it on desktop, and collapses to a labelled carousel when stacked.
 */
export function NewThisWeekSpotlight({
  vendors,
}: {
  vendors: VendorCardVendor[];
}) {
  return (
    <RotatingVendorCarousel
      vendors={vendors}
      label="New this week"
      fillHeight
      className="lg:h-full"
    />
  );
}
