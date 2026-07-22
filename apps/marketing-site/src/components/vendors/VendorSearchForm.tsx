"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";

/**
 * Directory search control.
 *
 * Progressive enhancement: the form is a native `GET` to `/vendors`, so it works
 * without hydration (submitting reloads `/vendors?q=…`). Once hydrated, submit
 * is intercepted for a soft navigation via {@link useRouter}, keeping the page
 * server-rendered while preserving shareable URLs and back/forward history.
 *
 * Seed `defaultValue` from the current `q`; pair with `key={q}` at the call site
 * so the field re-syncs on back/forward navigation. No `autoFocus`: focus must
 * not jump after navigation (especially on mobile).
 */
export function VendorSearchForm({
  defaultValue = "",
}: {
  defaultValue?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(
      trimmed ? `/vendors?q=${encodeURIComponent(trimmed)}` : "/vendors",
    );
  }

  const hasQuery = query.trim().length > 0;

  return (
    <form
      role="search"
      action="/vendors"
      method="get"
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded-2xl border border-surface-950/10 bg-surface-50 p-2 shadow-[0_18px_45px_-24px_rgba(76,70,57,0.55)] focus-within:border-primary-500/60"
    >
      <label htmlFor="vendor-search" className="sr-only">
        Search products, categories, or vendors
      </label>
      <div className="flex flex-1 items-center gap-3 px-2">
        <SearchIcon
          className="h-5 w-5 shrink-0 text-ink/70"
          aria-hidden="true"
        />
        <input
          id="vendor-search"
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products, categories, or vendors"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full border-0 bg-transparent py-2 text-base text-on-surface-50 placeholder:text-ink/60 focus:outline-none"
        />
      </div>

      {hasQuery ?
        <Link
          href="/vendors"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink/70 transition-colors hover:bg-surface-500/15 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <CloseIcon className="h-5 w-5" />
        </Link>
      : null}

      <button
        type="submit"
        className="btn btn-solid/primary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 font-subheading text-sm font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        <SearchIcon className="h-4 w-4 md:hidden" aria-hidden="true" />
        <span>Search</span>
      </button>
    </form>
  );
}
