import Link from "next/link";
import { VENDOR_CATEGORIES, categoryHref } from "@/lib/vendors/categories";

/**
 * Recovery state shown when a search returns nothing. Echoes the query, offers a
 * spelling/broaden hint, and gives real ways forward: popular category links and
 * a reset to the full directory. Renders sensible copy even if `query` is empty
 * (an unlikely edge — an empty query lists every vendor).
 */
export function VendorEmptyState({ query }: { query: string }) {
  const trimmed = query.trim();

  return (
    <div className="rounded-2xl border border-surface-500/30 bg-surface-50 p-8 text-center md:p-12">
      <h2 className="font-heading text-2xl text-ink sm:text-3xl">
        {trimmed ?
          <>No vendors match “{trimmed}”</>
        : "No vendors found"}
      </h2>
      <p className="mx-auto mt-3 max-w-md font-body text-on-surface-50/80">
        Double-check the spelling or try a broader term — searching by a
        category or product type usually turns up more.
      </p>

      <div className="mt-6">
        <p className="font-subheading text-xs font-semibold tracking-[0.24em] text-primary-500 uppercase">
          Try a popular category
        </p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {VENDOR_CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                href={categoryHref(category)}
                className="inline-flex items-center rounded-full border border-surface-950/15 bg-surface-50 px-4 py-1.5 font-subheading text-sm text-ink transition-colors hover:border-primary-500/60 hover:bg-primary-50 hover:text-on-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                {category}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <Link
          href="/vendors"
          className="btn btn-solid/primary inline-flex min-h-11 items-center justify-center font-subheading text-sm font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          Browse all vendors
        </Link>
      </div>
    </div>
  );
}
