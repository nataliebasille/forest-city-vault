import type { Vendor } from "@/lib/vendors/types";

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function VendorCard({ vendor }: { vendor: Vendor }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-surface-500/30 bg-surface-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-heading text-xl text-secondary-500">
          {vendor.name}
        </h2>
        <span className="shrink-0 rounded-md border border-surface-500/40 px-2 py-1 font-subheading text-xs text-secondary-500/80">
          {vendor.itemCount} {vendor.itemCount === 1 ? "item" : "items"}
        </span>
      </div>

      {vendor.priceRange ?
        <p className="font-subheading text-sm text-primary-500">
          {vendor.priceRange.min === vendor.priceRange.max ?
            formatPrice(vendor.priceRange.min)
          : `${formatPrice(vendor.priceRange.min)} – ${formatPrice(
              vendor.priceRange.max,
            )}`
          }
        </p>
      : null}

      {vendor.sampleItems.length > 0 ?
        <ul className="mt-auto flex flex-wrap gap-2 pt-1">
          {vendor.sampleItems.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="rounded-md border border-surface-500/40 px-2.5 py-1 font-subheading text-xs text-secondary-500/80"
            >
              {item}
            </li>
          ))}
        </ul>
      : null}
    </article>
  );
}
