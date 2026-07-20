import Link from "next/link";
import { SearchIcon } from "@/components/icons";
import { VENDOR_CATEGORIES, categoryHref } from "@/lib/vendors/categories";

/**
 * Homepage hero search. A native `GET` form pointed at the vendor directory, so
 * it works before (and without) hydration: pressing Enter or the button
 * navigates to `/vendors?q=…`. Category chips are plain links to pre-filtered
 * directory results, e.g. `/vendors?q=jewelry`.
 */
export function HeroSearch() {
  return (
    <div className="space-y-4 md:space-y-5">
      <form
        role="search"
        action="/vendors"
        method="get"
        className="flex flex-col gap-2 rounded-2xl border border-surface-950/10 bg-surface-50/90 p-2 shadow-[0_18px_45px_-24px_rgba(76,70,57,0.55)] backdrop-blur transition-colors focus-within:border-primary-500/60 sm:flex-row sm:items-center"
      >
        <label htmlFor="hero-search" className="sr-only">
          Search products, categories, or vendors
        </label>
        <div className="flex flex-1 items-center gap-3 px-3">
          <SearchIcon
            className="h-5 w-5 shrink-0 text-secondary-500/70"
            aria-hidden="true"
          />
          <input
            id="hero-search"
            type="search"
            name="q"
            placeholder="Search products, categories, or vendors"
            autoComplete="off"
            className="w-full border-0 bg-transparent px-0 py-2 text-base text-on-surface-50 placeholder:text-secondary-500/60 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="btn btn-solid/primary inline-flex min-h-11 shrink-0 items-center justify-center font-subheading text-sm font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          Search the vault
        </button>
      </form>

      {/* Mobile: single horizontally scrollable category row (no wrap). A right
          fade hints that more chips are available offscreen. */}
      <div className="relative md:hidden">
        <ul className="flex flex-nowrap gap-2 overflow-x-auto pr-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {VENDOR_CATEGORIES.map((category) => (
            <li key={category} className="shrink-0">
              <Link
                href={categoryHref(category)}
                aria-label={`Browse ${category} vendors`}
                className="inline-flex items-center rounded-full border border-surface-950/15 bg-surface-50/70 px-4 py-2 text-sm whitespace-nowrap text-secondary-500 transition-colors hover:border-primary-500/60 hover:bg-primary-50 hover:text-on-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                {category}
              </Link>
            </li>
          ))}
        </ul>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-accent-50/60 to-transparent"
        />
      </div>

      {/* Desktop: wrapping category chips that link straight to filtered results. */}
      <div className="hidden space-y-3 md:block">
        <p className="font-subheading text-xs tracking-[0.24em] text-secondary-500/80 uppercase">
          Popular right now
        </p>
        <ul className="flex flex-wrap gap-2">
          {VENDOR_CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                href={categoryHref(category)}
                aria-label={`Browse ${category} vendors`}
                className="inline-flex items-center rounded-full border border-surface-950/15 bg-surface-50/70 px-4 py-1.5 text-sm text-secondary-500 transition-colors hover:border-primary-500/60 hover:bg-primary-50 hover:text-on-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                {category}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
