import { describe, it } from "node:test";
import { expect } from "expect";
import { Effect, Exit } from "effect";
import {
  ALL_PERMISSIONS,
  hasPermission,
  MembershipDisabledError,
  permissionsForRole,
  requirePermission,
  STORE_ROLES,
  type StorePermission,
  type StoreRole,
} from "../index";

/**
 * The expected exact permission set for every role. Kept here (not imported from
 * the policy) so the test independently pins the mapping: changing the policy
 * without updating this table fails the test, and adding a role to
 * `STORE_ROLES` makes this `Record` a compile error until it is listed.
 */
const EXPECTED: Record<StoreRole, readonly StorePermission[]> = {
  owner: ALL_PERMISSIONS,
};

const sorted = (permissions: Iterable<StorePermission>) =>
  [...permissions].sort();

describe("permissions", () => {
  for (const role of STORE_ROLES) {
    it(`grants ${role} exactly its expected permission set`, () => {
      expect(sorted(permissionsForRole(role))).toEqual(sorted(EXPECTED[role]));
    });
  }

  it("grants the owner every permission", () => {
    expect(sorted(permissionsForRole("owner"))).toEqual(
      sorted(ALL_PERMISSIONS),
    );
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission("owner", permission)).toBe(true);
    }
  });

  describe("requirePermission", () => {
    it("succeeds when an active membership's role grants the permission", () => {
      const exit = Effect.runSyncExit(
        requirePermission({ role: "owner", status: "active" }, "store"),
      );

      expect(Exit.isSuccess(exit)).toBe(true);
    });

    // The `PermissionDeniedError` branch of `requirePermission` is intentionally
    // not exercised: `owner` is the only role and holds every permission, so no
    // active membership can lack one. A denial test will be added alongside the
    // first partial role that can actually be missing a permission.

    it("always denies a disabled membership, even an owner", () => {
      const exit = Effect.runSyncExit(
        requirePermission({ role: "owner", status: "disabled" }, "store"),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      const error =
        Exit.isFailure(exit) && exit.cause._tag === "Fail" ?
          exit.cause.error
        : undefined;
      expect(error).toBeInstanceOf(MembershipDisabledError);
    });
  });
});
