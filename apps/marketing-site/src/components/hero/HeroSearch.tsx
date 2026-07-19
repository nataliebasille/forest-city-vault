"use client";

import { useRef, useState } from "react";
import { SearchIcon } from "@/components/icons";

const POPULAR_CATEGORIES = [
  "Vintage",
  "Jewelry",
  "Art",
  "Apparel",
  "Home goods",
  "Gifts",
] as const;

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
    <div className="space-y-5">
      <form
        role="search"
        onSubmit={handleSubmit}
        className="group flex flex-col gap-3 rounded-2xl border border-surface-950/10 bg-surface-50/90 p-2 shadow-[0_18px_45px_-24px_rgba(76,70,57,0.55)] backdrop-blur transition-colors focus-within:border-primary-500/60 sm:flex-row sm:items-center"
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

      <div className="space-y-3">
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
