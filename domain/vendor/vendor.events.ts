import { AggregateEvent } from "@forest-city-vault/core-domain";
import { Schema } from "effect";
import { BasisPointsSchema } from "../value-objects/basis-points";
import { VendorItemSchema, VendorSchema } from "./vendor.entity";

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
      items: [],
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
    }) satisfies typeof VendorSchema.Type,
};

export type VendorCreatedEvent = AggregateEvent<
  "VendorCreated",
  typeof VendorCreatedSchema.Type
>;

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

export type VendorRenamedEvent = AggregateEvent<
  "VendorRenamed",
  typeof VendorRenamedSchema.Type
>;

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

export type VendorCloverCategoryLinkedEvent = AggregateEvent<
  "VendorCloverCategoryLinked",
  typeof VendorCloverCategoryLinkedSchema.Type
>;

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

export type VendorActivatedEvent = AggregateEvent<
  "VendorActivated",
  typeof VendorActivatedSchema.Type
>;

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

export type VendorDeactivatedEvent = AggregateEvent<
  "VendorDeactivated",
  typeof VendorDeactivatedSchema.Type
>;

const VendorItemAddedSchema = Schema.Struct({
  item: VendorItemSchema,
  updatedAt: Schema.Date,
});

export const VendorItemAdded = {
  schema: VendorItemAddedSchema,

  handler: (
    snapshot: typeof VendorSchema.Type,
    payload: typeof VendorItemAddedSchema.Type,
  ) =>
    ({
      ...snapshot,
      items: [...snapshot.items, payload.item],
      updatedAt: payload.updatedAt,
    }) satisfies typeof VendorSchema.Type,
};

export type VendorItemAddedEvent = AggregateEvent<
  "VendorItemAdded",
  typeof VendorItemAddedSchema.Type
>;

const VendorItemUpdatedSchema = Schema.Struct({
  item: VendorItemSchema,
  updatedAt: Schema.Date,
});

export const VendorItemUpdated = {
  schema: VendorItemUpdatedSchema,

  handler: (
    snapshot: typeof VendorSchema.Type,
    payload: typeof VendorItemUpdatedSchema.Type,
  ) =>
    ({
      ...snapshot,
      items: snapshot.items.map((existing) =>
        existing.cloverItemId === payload.item.cloverItemId ?
          payload.item
        : existing,
      ),
      updatedAt: payload.updatedAt,
    }) satisfies typeof VendorSchema.Type,
};

export type VendorItemUpdatedEvent = AggregateEvent<
  "VendorItemUpdated",
  typeof VendorItemUpdatedSchema.Type
>;

const VendorItemRemovedSchema = Schema.Struct({
  cloverItemId: Schema.String,
  updatedAt: Schema.Date,
});

export const VendorItemRemoved = {
  schema: VendorItemRemovedSchema,

  handler: (
    snapshot: typeof VendorSchema.Type,
    payload: typeof VendorItemRemovedSchema.Type,
  ) =>
    ({
      ...snapshot,
      items: snapshot.items.filter(
        (existing) => existing.cloverItemId !== payload.cloverItemId,
      ),
      updatedAt: payload.updatedAt,
    }) satisfies typeof VendorSchema.Type,
};

export type VendorItemRemovedEvent = AggregateEvent<
  "VendorItemRemoved",
  typeof VendorItemRemovedSchema.Type
>;
