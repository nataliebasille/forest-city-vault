import { Schema } from "effect";
import { StoreAccountSchema } from "./store-account.entity";

/**
 * Every store event carries the timestamp the action read from the {@link Clock}
 * so the event handlers stay pure reducers of `payload -> snapshot`: they never
 * call `new Date()` themselves. Time (like ids) enters the aggregate only
 * through the action, exactly as the `Sales` aggregate takes its timestamp from
 * the incoming payment payload rather than minting one in a handler.
 */

const StoreCreatedSchema = Schema.Struct({
  name: Schema.String,
  timeZone: Schema.String,
  createdAt: Schema.Date,
});

export const StoreCreated = {
  schema: StoreCreatedSchema,

  handler: (payload: typeof StoreCreatedSchema.Type) =>
    ({
      name: payload.name,
      status: "active",
      currency: "USD",
      timeZone: payload.timeZone,
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
    }) satisfies typeof StoreAccountSchema.Type,
};

const StoreRenamedSchema = Schema.Struct({
  name: Schema.String,
  updatedAt: Schema.Date,
});

export const StoreRenamed = {
  schema: StoreRenamedSchema,

  handler: (
    snapshot: typeof StoreAccountSchema.Type,
    payload: typeof StoreRenamedSchema.Type,
  ) =>
    ({
      ...snapshot,
      name: payload.name,
      updatedAt: payload.updatedAt,
    }) satisfies typeof StoreAccountSchema.Type,
};

const StoreTimeZoneChangedSchema = Schema.Struct({
  timeZone: Schema.String,
  updatedAt: Schema.Date,
});

export const StoreTimeZoneChanged = {
  schema: StoreTimeZoneChangedSchema,

  handler: (
    snapshot: typeof StoreAccountSchema.Type,
    payload: typeof StoreTimeZoneChangedSchema.Type,
  ) =>
    ({
      ...snapshot,
      timeZone: payload.timeZone,
      updatedAt: payload.updatedAt,
    }) satisfies typeof StoreAccountSchema.Type,
};

const StoreActivatedSchema = Schema.Struct({
  updatedAt: Schema.Date,
});

export const StoreActivated = {
  schema: StoreActivatedSchema,

  handler: (
    snapshot: typeof StoreAccountSchema.Type,
    payload: typeof StoreActivatedSchema.Type,
  ) =>
    ({
      ...snapshot,
      status: "active",
      updatedAt: payload.updatedAt,
    }) satisfies typeof StoreAccountSchema.Type,
};

const StoreDeactivatedSchema = Schema.Struct({
  updatedAt: Schema.Date,
});

export const StoreDeactivated = {
  schema: StoreDeactivatedSchema,

  handler: (
    snapshot: typeof StoreAccountSchema.Type,
    payload: typeof StoreDeactivatedSchema.Type,
  ) =>
    ({
      ...snapshot,
      status: "inactive",
      updatedAt: payload.updatedAt,
    }) satisfies typeof StoreAccountSchema.Type,
};
