import { Effect } from "effect";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { VendorDirectory } from "@/components/vendors/VendorDirectory";
import type { VendorSort } from "@/components/vendors/VendorResultsToolbar";
import { getVendorData } from "@/lib/vendors/data";
import { searchVendors } from "@/lib/vendors/search";

export const metadata: Metadata = {
  title: "Shop the Vault · Forest City Vault",
  description:
    "Browse and search the independent makers and vendors inside Forest City Vault.",
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : (value ?? "")).trim();
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; sort?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = firstParam(params.q);
  const sort: VendorSort =
    firstParam(params.sort) === "az" ? "az" : "relevance";

  const { vendors, count } = await Effect.runPromise(getVendorData);

  const results = searchVendors(vendors, query);
  if (sort === "az") {
    results.sort((a, b) => a.vendor.name.localeCompare(b.vendor.name));
  }

  return (
    <main className="vault-paper min-h-full">
      <SiteHeader />
      <VendorDirectory
        query={query}
        sort={sort}
        results={results}
        totalCount={count}
      />
    </main>
  );
}
