import { Schema } from "effect";

/**
 * The recognized store roles, in one place. `STORE_ROLES` is the single source
 * of truth: the permission policy is keyed by exactly these values (a
 * `Record<StoreRole, ...>`), so adding a role here forces the policy to map it
 * or fail to type-check.
 *
 * Only `owner` exists today — the store owner is the sole admin-portal persona.
 * Workers ring up sales at the Clover register and vendors use a separate
 * (future) vendor portal; neither is an admin-portal role. Additional roles
 * (e.g. a vendor-onboarding worker) will be added here when a persona actually
 * needs partial portal access, at which point the permission split becomes
 * meaningful.
 */
export const STORE_ROLES = ["owner"] as const;

export const StoreRoleSchema = Schema.Literal(...STORE_ROLES);
export type StoreRole = typeof StoreRoleSchema.Type;

export const isStoreRole = (value: unknown): value is StoreRole =>
  typeof value === "string" &&
  (STORE_ROLES as readonly string[]).includes(value);

export const StoreMembershipStatusSchema = Schema.Literal("active", "disabled");
export type StoreMembershipStatus = typeof StoreMembershipStatusSchema.Type;

export const StoreMembershipSchema = Schema.Struct({
  storeId: Schema.String,
  userId: Schema.String,
  email: Schema.String,
  role: StoreRoleSchema,
  status: StoreMembershipStatusSchema,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
});

export type StoreMembershipSnapshot = typeof StoreMembershipSchema.Type;
