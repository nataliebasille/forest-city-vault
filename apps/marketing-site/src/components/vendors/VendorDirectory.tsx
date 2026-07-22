import type { VendorMatch } from "@/lib/vendors/search";
import { VendorCategoryFilters } from "./VendorCategoryFilters";
import { VendorEmptyState } from "./VendorEmptyState";
import { VendorGrid } from "./VendorGrid";
import { VendorResultsToolbar, type VendorSort } from "./VendorResultsToolbar";
import { VendorSearchForm } from "./VendorSearchForm";

/**
 * The vendor directory shell. Server-rendered from URL state so every view is
 * shareable and works with back/forward: the search form, category chips, and
 * sort control all drive the page through the `q`/`sort` query params rather
 * than client-side filtering. Composes the compact intro, the prominent search
 * control, category chips, the results toolbar, and either the grid or a
 * recovery empty state.
 */
export function VendorDirectory({
  query,
  sort,
  results,
  totalCount,
}: {
  query: string;
  sort: VendorSort;
  results: VendorMatch[];
  totalCount: number;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10 md:py-12">
      <header className="max-w-2xl space-y-2">
        <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
          The Vault Directory
        </p>
        <h1 className="font-heading text-3xl leading-tight text-secondary-500 sm:text-4xl">
          Browse the Vault
        </h1>
        <p className="font-body text-base/7 text-on-surface-50/80">
          Discover products from {totalCount} independent vendors in Ohio City.
        </p>
      </header>

      <div className="mt-6 space-y-5">
        {/* `key` re-syncs the controlled input to the URL on back/forward nav. */}
        <VendorSearchForm key={query} defaultValue={query} />
        <VendorCategoryFilters query={query} />
      </div>

      <section aria-label="Vendor results" className="mt-8 space-y-6">
        <VendorResultsToolbar
          count={results.length}
          query={query}
          sort={sort}
        />
        {results.length > 0 ?
          <VendorGrid results={results} />
        : <VendorEmptyState query={query} />}
      </section>
    </div>
  );
}
