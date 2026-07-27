import { Data, Effect } from "effect";
import {
  STORE_ROLES,
  type StoreRole,
} from "../store-membership/store-membership.entity";

/**
 * The complete vocabulary of store permissions. These name capabilities that
 * later slices will implement; nothing here grants behaviour beyond the checks
 * in this module. `ALL_PERMISSIONS` is the single source of truth and is
 * asserted to be exhaustive over {@link StorePermission} below, so adding a
 * permission to the type without listing it here is a compile error.
 */
export type StorePermission =
  | "store:read"
  | "store:update"
  | "memberships:read"
  | "memberships:create"
  | "memberships:update"
  | "memberships:disable"
  | "clover:read"
  | "vendors:read"
  | "vendors:manage"
  | "inventory:read"
  | "inventory:manage"
  | "sales:read"
  | "reconciliation:manage"
  | "statements:read"
  | "statements:manage"
  | "payouts:read"
  | "payouts:manage";

export const ALL_PERMISSIONS = [
  "store:read",
  "store:update",
  "memberships:read",
  "memberships:create",
  "memberships:update",
  "memberships:disable",
  "clover:read",
  "vendors:read",
  "vendors:manage",
  "inventory:read",
  "inventory:manage",
  "sales:read",
  "reconciliation:manage",
  "statements:read",
  "statements:manage",
  "payouts:read",
  "payouts:manage",
] as const satisfies readonly StorePermission[];

// Exhaustiveness guard: if `StorePermission` gains a member that is missing from
// `ALL_PERMISSIONS`, this assignment fails to type-check.
type _AllPermissionsAreExhaustive =
  StorePermission extends (typeof ALL_PERMISSIONS)[number] ? true
  : ["ALL_PERMISSIONS is missing a StorePermission"];
const _allPermissionsExhaustive: _AllPermissionsAreExhaustive = true;
void _allPermissionsExhaustive;

/** The membership shape `requirePermission` needs — just role and status. */
export type PermissionSubject = {
  readonly role: StoreRole;
  readonly status: "active" | "disabled";
};

/** A disabled membership is denied every permission, regardless of its role. */
export class MembershipDisabledError extends Data.TaggedError(
  "domain/Permissions/MembershipDisabledError",
)<{}> {}

/** The subject's role does not grant the required permission. */
export class PermissionDeniedError extends Data.TaggedError(
  "domain/Permissions/PermissionDeniedError",
)<{ readonly role: StoreRole; readonly permission: StorePermission }> {}

/**
 * The role → permission policy. Keyed by `StoreRole` (a `Record`), so adding a
 * role to {@link STORE_ROLES} without mapping it here is a compile error — the
 * mapping is exhaustive over every role by construction.
 */
const ROLE_PERMISSIONS: Record<StoreRole, ReadonlySet<StorePermission>> = {
  // Owner receives every permission.
  owner: new Set(ALL_PERMISSIONS),

  // Manager receives all permissions except membership mutation and payout
  // management; it may still read memberships and payouts.
  manager: new Set(
    ALL_PERMISSIONS.filter(
      (permission) =>
        permission !== "memberships:create" &&
        permission !== "memberships:update" &&
        permission !== "memberships:disable" &&
        permission !== "payouts:manage",
    ),
  ),

  inventory: new Set([
    "store:read",
    "clover:read",
    "vendors:read",
    "inventory:read",
    "inventory:manage",
    "sales:read",
  ]),

  finance: new Set([
    "store:read",
    "vendors:read",
    "inventory:read",
    "sales:read",
    "statements:read",
    "statements:manage",
    "payouts:read",
    "payouts:manage",
  ]),

  readOnly: new Set([
    "store:read",
    "clover:read",
    "vendors:read",
    "inventory:read",
    "sales:read",
    "statements:read",
    "payouts:read",
  ]),
};

/** Returns the exact set of permissions granted to `role`. */
export const permissionsForRole = (role: StoreRole) => ROLE_PERMISSIONS[role];

/** Whether `role` grants `permission`. Ignores membership status. */
export const hasPermission = (role: StoreRole, permission: StorePermission) =>
  ROLE_PERMISSIONS[role].has(permission);

/**
 * Authorizes `subject` for `permission`, failing when the membership is disabled
 * (checked first, so a disabled owner is still denied) or when the role does not
 * grant the permission.
 */
export const requirePermission = (
  subject: PermissionSubject,
  permission: StorePermission,
) => {
  if (subject.status === "disabled") {
    return Effect.fail(new MembershipDisabledError());
  }

  return hasPermission(subject.role, permission) ?
      Effect.void
    : Effect.fail(
        new PermissionDeniedError({ role: subject.role, permission }),
      );
};

export { STORE_ROLES };
