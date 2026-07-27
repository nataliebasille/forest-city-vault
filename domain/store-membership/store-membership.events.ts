import { Schema } from "effect";
import {
  StoreMembershipSchema,
  StoreRoleSchema,
} from "./store-membership.entity";

/**
 * As with the store aggregate, every membership event carries the timestamp the
 * action read from the {@link Clock}, keeping the event handlers pure reducers
 * of `payload -> snapshot`.
 */

const MembershipCreatedSchema = Schema.Struct({
  storeId: Schema.String,
  userId: Schema.String,
  email: Schema.String,
  role: StoreRoleSchema,
  createdAt: Schema.Date,
});

export const MembershipCreated = {
  schema: MembershipCreatedSchema,

  handler: (payload: typeof MembershipCreatedSchema.Type) =>
    ({
      storeId: payload.storeId,
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      status: "active",
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
    }) satisfies typeof StoreMembershipSchema.Type,
};

const MembershipRoleChangedSchema = Schema.Struct({
  role: StoreRoleSchema,
  updatedAt: Schema.Date,
});

export const MembershipRoleChanged = {
  schema: MembershipRoleChangedSchema,

  handler: (
    snapshot: typeof StoreMembershipSchema.Type,
    payload: typeof MembershipRoleChangedSchema.Type,
  ) =>
    ({
      ...snapshot,
      role: payload.role,
      updatedAt: payload.updatedAt,
    }) satisfies typeof StoreMembershipSchema.Type,
};

const MembershipDisabledSchema = Schema.Struct({
  updatedAt: Schema.Date,
});

export const MembershipDisabled = {
  schema: MembershipDisabledSchema,

  handler: (
    snapshot: typeof StoreMembershipSchema.Type,
    payload: typeof MembershipDisabledSchema.Type,
  ) =>
    ({
      ...snapshot,
      status: "disabled",
      updatedAt: payload.updatedAt,
    }) satisfies typeof StoreMembershipSchema.Type,
};

const MembershipReactivatedSchema = Schema.Struct({
  updatedAt: Schema.Date,
});

export const MembershipReactivated = {
  schema: MembershipReactivatedSchema,

  handler: (
    snapshot: typeof StoreMembershipSchema.Type,
    payload: typeof MembershipReactivatedSchema.Type,
  ) =>
    ({
      ...snapshot,
      status: "active",
      updatedAt: payload.updatedAt,
    }) satisfies typeof StoreMembershipSchema.Type,
};
