import Link from "next/link";
import {
  VENDOR_CATEGORIES,
  categoryHref,
  categoryQuery,
} from "@/lib/vendors/categories";

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-full border px-4 py-1.5 font-subheading text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500";
const CHIP_ACTIVE =
  "border-primary-500 bg-primary-500 text-on-primary-500 shadow-[0_10px_25px_-18px_rgba(175,95,29,0.9)]";
const CHIP_INACTIVE =
  "border-surface-950/15 bg-surface-50 text-secondary-500 hover:border-primary-500/60 hover:bg-primary-50 hover:text-on-primary-50";

/**
 * Category quick-filters. Each chip is a link to a pre-filtered directory view
 * (`/vendors?q=jewelry`), so selecting one applies immediately, is shareable,
 * and works without JavaScript. The active chip is announced with
 * `aria-current` — the link-equivalent of a pressed toggle — and `All` clears
 * the filter by linking back to `/vendors`.
 */
export function VendorCategoryFilters({ query }: { query: string }) {
  const active = query.trim().toLowerCase();

  const chips = [
    { label: "All", value: "", href: "/vendors" },
    ...VENDOR_CATEGORIES.map((category) => ({
      label: category,
      value: categoryQuery(category),
      href: categoryHref(category),
    })),
  ];

  return (
    <nav aria-label="Filter vendors by category">
      <ul className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => {
          const isActive = chip.value === active;
          return (
            <li key={chip.label} className="shrink-0">
              <Link
                href={chip.href}
                aria-current={isActive ? "true" : undefined}
                className={`${CHIP_BASE} whitespace-nowrap ${
                  isActive ? CHIP_ACTIVE : CHIP_INACTIVE
                }`}
              >
                {chip.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
