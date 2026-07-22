import { Effect } from "effect";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { VendorProductGrid } from "@/components/vendors/VendorProductGrid";
import { VendorProfile } from "@/components/vendors/VendorProfile";
import { getVendorBySlug, getVendors } from "@/lib/vendors/data";

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const vendors = await Effect.runPromise(getVendors);
  return vendors.map((vendor) => ({ slug: vendor.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await Effect.runPromise(getVendorBySlug(slug));

  if (!vendor) {
    return { title: "Vendor not found · Forest City Vault" };
  }

  return {
    title: `${vendor.name} · Forest City Vault`,
    description: `Browse ${vendor.itemCount} products from ${vendor.name}, an independent vendor inside Forest City Vault.`,
  };
}

export default async function VendorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const vendor = await Effect.runPromise(getVendorBySlug(slug));

  if (!vendor) {
    notFound();
  }

  return (
    <main className="vault-paper min-h-full">
      <SiteHeader />
      <VendorProfile vendor={vendor}>
        <VendorProductGrid products={vendor.products} />
      </VendorProfile>
    </main>
  );
}
