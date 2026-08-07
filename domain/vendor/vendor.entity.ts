import { Schema } from "effect";
import { BasisPointsSchema } from "../value-objects/basis-points";

export const VendorStatusSchema = Schema.Literal("active", "inactive");
export type VendorStatus = typeof VendorStatusSchema.Type;

export const VendorSchema = Schema.Struct({
  name: Schema.String,
  status: VendorStatusSchema,

  /**
   * The vendor's share of a sale in basis points (see {@link BasisPointsSchema}).
   * Defaults to 6000 (60%) at creation.
   */
  commissionShare: BasisPointsSchema,

  /**
   * The id of the Clover category this vendor corresponds to — in Clover, each
   * vendor is organized as a category. It is `null` until the vendor is linked
   * to its category, so a vendor can exist in the domain before the Clover
   * linkage is known.
   */
  cloverCategoryId: Schema.NullOr(Schema.String),

  createdAt: Schema.Date,
  updatedAt: Schema.Date,
});

export type VendorSnapshot = typeof VendorSchema.Type;
