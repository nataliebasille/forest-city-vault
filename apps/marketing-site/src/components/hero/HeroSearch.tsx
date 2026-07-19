"use client";

import { useRef, useState } from "react";
import { ArrowRightIcon, SearchIcon } from "@/components/icons";

const POPULAR_CATEGORIES = [
  "Vintage",
  "Jewelry",
  "Art",
  "Apparel",
  "Home goods",
  "Gifts",
] as const;

// Until marketplace search exists, both the mobile browse control and the
// category chips point here — the featured vendors section — so they perform a
// real navigation instead of a no-op.
const BROWSE_TARGET = "#vendors";

export function HeroSearch() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // TODO: Connect to marketplace search once search infrastructure exists.
    // Intentionally a no-op for now so the form never navigates to a dead route.
  };

  const applyCategory = (category: string) => {
    setQuery(category);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Mobile: one compact browse control. No text input is exposed because
          there is no search route yet; activating it jumps to Featured Vendors. */}
      <a
        href={BROWSE_TARGET}
        aria-label="Browse the vault — jump to featured vendors"
        className="flex items-center gap-3 rounded-full border border-surface-950/10 bg-surface-50/90 py-2 pr-2 pl-4 shadow-[0_10px_30px_-20px_rgba(76,70,57,0.55)] backdrop-blur transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 md:hidden"
      >
        <SearchIcon
          className="h-5 w-5 shrink-0 text-secondary-500/70"
          aria-hidden="true"
        />
        <span className="flex-1 text-base text-secondary-500/70">
          Browse the vault
        </span>
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-surface-50"
          aria-hidden="true"
        >
          <ArrowRightIcon className="h-4 w-4" />
        </span>
      </a>

      {/* Desktop: full search form (functional behavior retained). */}
      <form
        role="search"
        onSubmit={handleSubmit}
        className="group hidden flex-col gap-3 rounded-2xl border border-surface-950/10 bg-surface-50/90 p-2 shadow-[0_18px_45px_-24px_rgba(76,70,57,0.55)] backdrop-blur transition-colors focus-within:border-primary-500/60 sm:flex-row sm:items-center md:flex"
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
            ref={inputRef}
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, categories, or vendors"
            autoComplete="off"
            className="w-full border-0 bg-transparent px-0 py-2 text-base text-on-surface-50 placeholder:text-secondary-500/60 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="btn btn-solid/primary inline-flex shrink-0 items-center justify-center font-subheading text-sm font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          Search the vault
        </button>
      </form>

      {/* Mobile: single horizontally scrollable category row (no wrap). A right
          fade hints that more chips are available offscreen. */}
      <div className="relative md:hidden">
        <ul className="flex flex-nowrap gap-2 overflow-x-auto pr-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {POPULAR_CATEGORIES.map((category) => (
            <li key={category} className="shrink-0">
              <a
                href={BROWSE_TARGET}
                aria-label={`Browse ${category} vendors`}
                className="inline-flex items-center rounded-full border border-surface-950/15 bg-surface-50/70 px-4 py-2 text-sm whitespace-nowrap text-secondary-500 transition-colors hover:border-primary-500/60 hover:bg-primary-50 hover:text-on-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                {category}
              </a>
            </li>
          ))}
        </ul>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-accent-50/60 to-transparent"
        />
      </div>

      {/* Desktop: wrapping category chips that seed the search input. */}
      <div className="hidden space-y-3 md:block">
        <p className="font-subheading text-xs tracking-[0.24em] text-secondary-500/80 uppercase">
          Popular right now
        </p>
        <ul className="flex flex-wrap gap-2">
          {POPULAR_CATEGORIES.map((category) => (
            <li key={category}>
              <button
                type="button"
                onClick={() => applyCategory(category)}
                className="rounded-full border border-surface-950/15 bg-surface-50/70 px-4 py-1.5 text-sm text-secondary-500 transition-colors hover:border-primary-500/60 hover:bg-primary-50 hover:text-on-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                {category}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
