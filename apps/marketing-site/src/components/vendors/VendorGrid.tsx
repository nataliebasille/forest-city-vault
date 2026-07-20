import type { VendorMatch } from "@/lib/vendors/search";
import { VendorCard } from "./VendorCard";

/**
 * Presentational grid of vendor cards. Server-renderable: it takes an
 * already-resolved, already-ranked list of matches and has no client-side
 * state, so the directory stays in the server-rendered HTML. Each entry carries
 * the product names that matched the query, which the card surfaces as a
 * "Matches: …" hint.
 */
export function VendorGrid({ results }: { results: VendorMatch[] }) {
  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {results.map(({ vendor, matchedItems }) => (
        <li key={vendor.slug}>
          <VendorCard vendor={vendor} matchedItems={matchedItems} />
        </li>
      ))}
    </ul>
  );
}
