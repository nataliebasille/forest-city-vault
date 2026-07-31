import { Data, Effect } from "effect";
import {
  STORE_ROLES,
  type StoreRole,
} from "../store-membership/store-membership.entity";

/**
 * The complete vocabulary of store permissions — one coarse capability per
 * admin-portal resource area. These name capabilities that later slices will
 * implement; nothing here grants behaviour beyond the checks in this module.
 * `ALL_PERMISSIONS` is the single source of truth and is asserted to be
 * exhaustive over {@link StorePermission} below, so adding a permission to the
 * type without listing it here is a compile error.
 *
 * These are intentionally coarse (no `:read`/`:manage` split): `owner` is the
 * only role today and holds every permission, so finer granularity would be
 * unused. A permission will be split (e.g. into read vs manage) when a role
 * that needs the narrower grant is actually introduced.
 */
export type StorePermission =
  | "store"
  | "memberships"
  | "vendors"
  | "inventory"
  | "sales"
  | "statements"
  | "payouts"
  | "reconciliation";

export const ALL_PERMISSIONS = [
  "store",
  "memberships",
  "vendors",
  "inventory",
  "sales",
  "statements",
  "payouts",
  "reconciliation",
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
 *
 * Today `owner` is the only role and receives every permission. When a partial
 * role is added, give it a narrower set here.
 */
const ROLE_PERMISSIONS: Record<StoreRole, ReadonlySet<StorePermission>> = {
  // Owner receives every permission.
  owner: new Set(ALL_PERMISSIONS),
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
 *
 * The `PermissionDeniedError` branch is currently unreachable: `owner` is the
 * only role and holds every permission, so no active membership can lack one. It
 * is kept deliberately — the moment a partial role is introduced it becomes
 * live, and the `permission` argument stays meaningful at every call site.
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
