import { Schema } from "effect";

/**
 * A share expressed in basis points (1/100 of a percent), so 6000 means 60%.
 * Modeled as an integer bounded to the inclusive 0..10000 range (0%..100%),
 * mirroring the database check on `fcv_vendors.default_vendor_share`, so a
 * share can never drift outside a meaningful percentage.
 */
export const BasisPointsSchema = Schema.Number.pipe(
  Schema.int({
    message: () => "Basis points must be an integer",
  }),
  Schema.between(0, 10000, {
    message: () => "Basis points must be between 0 and 10000",
  }),
);
