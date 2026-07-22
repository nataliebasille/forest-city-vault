import type { Product } from "@/lib/vendors/types";
import { VendorProductCard } from "./VendorProductCard";

/**
 * Presentational grid of a vendor's products. Server-renderable: it takes an
 * already-resolved product list with no client-side state. Renders a quiet empty
 * state when the vendor has no visible products (an unlikely edge, since vendors
 * are derived from their items).
 */
export function VendorProductGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <p className="rounded-2xl border border-surface-500/30 bg-surface-50 p-8 text-center font-body text-on-surface-50/80">
        This vendor has no products listed right now. Visit the store to see
        what&rsquo;s in stock.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => (
        <li key={product.name}>
          <VendorProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
