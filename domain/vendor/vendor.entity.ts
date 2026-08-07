import { Schema } from "effect";
import { BasisPointsSchema } from "../value-objects/basis-points";
import { CentsSchema } from "../value-objects/cents";

export const VendorStatusSchema = Schema.Literal("active", "inactive");
export type VendorStatus = typeof VendorStatusSchema.Type;

/**
 * An item a vendor sells, sourced from Clover. Each item is a Clover inventory
 * item within the vendor's Clover category, so `cloverItemId` is its identity
 * within the vendor's item collection. `price` is stored in cents (see
 * {@link CentsSchema}).
 */
export const VendorItemSchema = Schema.Struct({
  cloverItemId: Schema.String,
  name: Schema.String,
  price: CentsSchema,
});

export type VendorItem = typeof VendorItemSchema.Type;

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

  /**
   * The items this vendor sells, mirrored from Clover. Keyed by
   * {@link VendorItemSchema.cloverItemId}; empty until items are synced.
   */
  items: Schema.Array(VendorItemSchema),

  createdAt: Schema.Date,
  updatedAt: Schema.Date,
});

export type VendorSnapshot = typeof VendorSchema.Type;
