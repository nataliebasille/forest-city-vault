"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SearchIcon } from "@/components/icons";

/**
 * Search entry point used on both the directory and the search results page.
 *
 * Submitting navigates to `/vendors/search?q=…` so the results page can filter
 * server-side from the URL (shareable, no hydration flash). An empty query goes
 * back to the directory. Seed `defaultValue` from the current `q` on the
 * results page — pair it with `key={q}` at the call site so the field re-syncs
 * when the URL changes (back/forward navigation).
 */
export function VendorSearchForm({
  defaultValue = "",
  autoFocus = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(
      trimmed ? `/vendors/search?q=${encodeURIComponent(trimmed)}` : "/vendors",
    );
  }

  return (
    <form
      role="search"
      action="/vendors/search"
      method="get"
      onSubmit={handleSubmit}
      className="flex items-center gap-3 rounded-2xl border border-surface-950/10 bg-surface-50 px-4 py-2 shadow-[0_18px_45px_-24px_rgba(76,70,57,0.55)] focus-within:border-primary-500/60"
    >
      <label htmlFor="vendor-search" className="sr-only">
        Search vendors
      </label>
      <SearchIcon
        className="h-5 w-5 shrink-0 text-secondary-500/70"
        aria-hidden="true"
      />
      <input
        id="vendor-search"
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search vendors and products"
        autoComplete="off"
        autoFocus={autoFocus}
        className="w-full border-0 bg-transparent py-2 text-base text-on-surface-50 placeholder:text-secondary-500/60 focus:outline-none"
      />
    </form>
  );
}
