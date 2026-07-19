import { Effect } from "effect";
import type { Metadata } from "next";
import Link from "next/link";
import { VendorGrid } from "@/components/vendors/VendorGrid";
import { VendorSearchForm } from "@/components/vendors/VendorSearchForm";
import { getVendorData } from "@/lib/vendors/data";
import { searchVendors } from "@/lib/vendors/search";

export const metadata: Metadata = {
  title: "Search vendors · Forest City Vault",
  description:
    "Search the independent makers and vendors inside Forest City Vault.",
};

export default async function VendorsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : (q ?? "")).trim();

  const { vendors } = await Effect.runPromise(getVendorData);
  const results = searchVendors(vendors, query);

  return (
    <main className="vault-paper min-h-full">
      <div className="mx-auto w-full max-w-7xl px-6 py-12 md:px-10 md:py-16">
        <div className="space-y-4">
          <Link
            href="/vendors"
            className="nav-link inline-flex items-center font-subheading text-sm font-semibold text-primary-500"
          >
            <span className="nav-underline">← Back to directory</span>
          </Link>
          <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
            Vendor search
          </p>
          <h1 className="font-heading text-4xl leading-tight text-secondary-500 sm:text-5xl">
            {query ? `Results for “${query}”` : "Search vendors"}
          </h1>
        </div>

        <div className="mt-10 space-y-8">
          <VendorSearchForm key={query} defaultValue={query} autoFocus />

          <p className="font-subheading text-sm text-secondary-500/70">
            {query ?
              `Showing ${results.length} of ${vendors.length} vendors`
            : `Search across all ${vendors.length} vendors`}
          </p>

          <VendorGrid
            vendors={results}
            emptyState={
              <p className="rounded-xl border border-surface-500/30 bg-surface-50 p-8 text-center font-body text-on-surface-50/80">
                No vendors match “{query}”.
              </p>
            }
          />
        </div>
      </div>
    </main>
  );
}
