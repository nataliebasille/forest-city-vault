import { Schema } from "effect";
import { BasisPointsSchema } from "../value-objects/basis-points";
import { VendorSchema } from "./vendor.entity";

/**
 * As with the store and membership aggregates, every vendor event carries the
 * timestamp the action read from the {@link Clock}, keeping the event handlers
 * pure reducers of `payload -> snapshot` that never call `new Date()`.
 */

const VendorCreatedSchema = Schema.Struct({
  name: Schema.String,
  commissionShare: BasisPointsSchema,
  cloverCategoryId: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
});

export const VendorCreated = {
  schema: VendorCreatedSchema,

  handler: (payload: typeof VendorCreatedSchema.Type) =>
    ({
      name: payload.name,
      status: "active",
      commissionShare: payload.commissionShare,
      cloverCategoryId: payload.cloverCategoryId,
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
    }) satisfies typeof VendorSchema.Type,
};

const VendorRenamedSchema = Schema.Struct({
  name: Schema.String,
  updatedAt: Schema.Date,
});

export const VendorRenamed = {
  schema: VendorRenamedSchema,

  handler: (
    snapshot: typeof VendorSchema.Type,
    payload: typeof VendorRenamedSchema.Type,
  ) =>
    ({
      ...snapshot,
      name: payload.name,
      updatedAt: payload.updatedAt,
    }) satisfies typeof VendorSchema.Type,
};

const VendorCloverCategoryLinkedSchema = Schema.Struct({
  cloverCategoryId: Schema.String,
  updatedAt: Schema.Date,
});

export const VendorCloverCategoryLinked = {
  schema: VendorCloverCategoryLinkedSchema,

  handler: (
    snapshot: typeof VendorSchema.Type,
    payload: typeof VendorCloverCategoryLinkedSchema.Type,
  ) =>
    ({
      ...snapshot,
      cloverCategoryId: payload.cloverCategoryId,
      updatedAt: payload.updatedAt,
    }) satisfies typeof VendorSchema.Type,
};

const VendorActivatedSchema = Schema.Struct({
  updatedAt: Schema.Date,
});

export const VendorActivated = {
  schema: VendorActivatedSchema,

  handler: (
    snapshot: typeof VendorSchema.Type,
    payload: typeof VendorActivatedSchema.Type,
  ) =>
    ({
      ...snapshot,
      status: "active",
      updatedAt: payload.updatedAt,
    }) satisfies typeof VendorSchema.Type,
};

const VendorDeactivatedSchema = Schema.Struct({
  updatedAt: Schema.Date,
});

export const VendorDeactivated = {
  schema: VendorDeactivatedSchema,

  handler: (
    snapshot: typeof VendorSchema.Type,
    payload: typeof VendorDeactivatedSchema.Type,
  ) =>
    ({
      ...snapshot,
      status: "inactive",
      updatedAt: payload.updatedAt,
    }) satisfies typeof VendorSchema.Type,
};
