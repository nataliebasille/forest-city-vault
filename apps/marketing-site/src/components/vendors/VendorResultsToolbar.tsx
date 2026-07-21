import Link from "next/link";
import { cn } from "@/lib/cn";

export type VendorSort = "relevance" | "az";

function buildHref(query: string, sort: VendorSort): string {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (sort !== "relevance") {
    params.set("sort", sort);
  }
  const qs = params.toString();
  return qs ? `/vendors?${qs}` : "/vendors";
}

function countLabel(count: number, query: string): string {
  const noun = count === 1 ? "vendor" : "vendors";
  return query ? `${count} ${noun} for “${query}”` : `${count} ${noun}`;
}

/**
 * Compact row above the grid: a live result count plus an optional sort toggle.
 *
 * The count sits in an `aria-live="polite"` region so screen readers hear the
 * new total after a client-side (soft) navigation. Sorting is only offered when
 * a query is active — without one the directory is already alphabetical, so an
 * extra control would just add clutter.
 */
export function VendorResultsToolbar({
  count,
  query,
  sort,
}: {
  count: number;
  query: string;
  sort: VendorSort;
}) {
  const showSort = query.length > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        aria-live="polite"
        className="font-subheading text-sm text-secondary-500/80"
      >
        {countLabel(count, query)}
      </p>

      {showSort ?
        <div
          role="group"
          aria-label="Sort vendors"
          className="inline-flex items-center rounded-full border border-surface-950/15 bg-surface-50 p-0.5 text-sm"
        >
          {(
            [
              { value: "relevance", label: "Best match" },
              { value: "az", label: "A–Z" },
            ] as const
          ).map((option) => {
            const isActive = option.value === sort;
            return (
              <Link
                key={option.value}
                href={buildHref(query, option.value)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 font-subheading transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
                  isActive ?
                    "bg-primary-500 text-on-primary-500"
                  : "text-secondary-500/80 hover:text-secondary-500",
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      : null}
    </div>
  );
}
