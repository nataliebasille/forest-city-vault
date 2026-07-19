import { type FeaturedVendor } from "./FeaturedVendorCard";
import { RotatingVendorCarousel } from "./RotatingVendorCarousel";

export function NewThisWeekSpotlight({
  vendors,
}: {
  vendors: FeaturedVendor[];
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
