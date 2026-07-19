import type { ReactNode } from "react";
import type { Vendor } from "@/lib/vendors/types";
import { VendorCard } from "./VendorCard";

/**
 * Presentational grid of vendor cards. Server-renderable: it takes an
 * already-resolved list of vendors and has no client-side state, which keeps
 * both the directory and the search results page in the static/server HTML.
 */
export function VendorGrid({
  vendors,
  emptyState = null,
}: {
  vendors: Vendor[];
  emptyState?: ReactNode;
}) {
  if (vendors.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {vendors.map((vendor) => (
        <li key={vendor.slug}>
          <VendorCard vendor={vendor} />
        </li>
      ))}
    </ul>
  );
}
