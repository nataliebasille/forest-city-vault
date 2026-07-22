/**
 * Shared currency formatting for the vendor UI. Extracted so the directory card,
 * vendor profile, and product cards all render prices identically.
 */

/** Format a dollar amount as USD, hiding cents for whole-dollar values. */
export function formatPrice(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Human label for a price range, or `null` when the range is unknown. */
export function priceRangeLabel(
  range: { min: number; max: number } | null,
): string | null {
  if (!range) {
    return null;
  }
  const { min, max } = range;
  return min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`;
}
