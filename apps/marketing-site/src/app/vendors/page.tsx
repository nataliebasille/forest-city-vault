import { Effect } from "effect";
import type { Metadata } from "next";
import Link from "next/link";
import { VendorGrid } from "@/components/vendors/VendorGrid";
import { VendorSearchForm } from "@/components/vendors/VendorSearchForm";
import { getVendorData } from "@/lib/vendors/data";

export const metadata: Metadata = {
  title: "Browse vendors · Forest City Vault",
  description:
    "Browse the independent makers and vendors inside Forest City Vault.",
};

export default async function VendorsPage() {
  const { vendors, count } = await Effect.runPromise(getVendorData);

  return (
    <main className="vault-paper min-h-full">
      <div className="mx-auto w-full max-w-7xl px-6 py-12 md:px-10 md:py-16">
        <div className="space-y-4">
          <Link
            href="/"
            className="nav-link inline-flex items-center font-subheading text-sm font-semibold text-primary-500"
          >
            <span className="nav-underline">← Back home</span>
          </Link>
          <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
            The vault directory
          </p>
          <h1 className="font-heading text-4xl leading-tight text-secondary-500 sm:text-5xl">
            Browse all {count} vendors
          </h1>
          <p className="max-w-2xl font-body text-lg/8 text-on-surface-50/80">
            Every independent maker inside Forest City Vault. Search by vendor
            name or by the products they carry.
          </p>
        </div>

        <div className="mt-10 space-y-8">
          <VendorSearchForm />
          <VendorGrid vendors={vendors} />
        </div>
      </div>
    </main>
  );
}
