import { describe, it } from "node:test";
import { expect } from "expect";
import { Effect, Exit } from "effect";
import {
  ALL_PERMISSIONS,
  hasPermission,
  MembershipDisabledError,
  permissionsForRole,
  PermissionDeniedError,
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
  manager: [
    "store:read",
    "store:update",
    "memberships:read",
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
  ],
  inventory: [
    "store:read",
    "clover:read",
    "vendors:read",
    "inventory:read",
    "inventory:manage",
    "sales:read",
  ],
  finance: [
    "store:read",
    "vendors:read",
    "inventory:read",
    "sales:read",
    "statements:read",
    "statements:manage",
    "payouts:read",
    "payouts:manage",
  ],
  readOnly: [
    "store:read",
    "clover:read",
    "vendors:read",
    "inventory:read",
    "sales:read",
    "statements:read",
    "payouts:read",
  ],
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
  });

  it("does not grant the manager membership-mutation or payout management", () => {
    for (const denied of [
      "memberships:create",
      "memberships:update",
      "memberships:disable",
      "payouts:manage",
    ] as const) {
      expect(hasPermission("manager", denied)).toBe(false);
    }
    // The manager may still read memberships and payouts.
    expect(hasPermission("manager", "memberships:read")).toBe(true);
    expect(hasPermission("manager", "payouts:read")).toBe(true);
  });

  describe("requirePermission", () => {
    it("succeeds when an active membership's role grants the permission", () => {
      const exit = Effect.runSyncExit(
        requirePermission({ role: "owner", status: "active" }, "store:update"),
      );

      expect(Exit.isSuccess(exit)).toBe(true);
    });

    it("fails with PermissionDeniedError when the role lacks the permission", () => {
      const exit = Effect.runSyncExit(
        requirePermission(
          { role: "readOnly", status: "active" },
          "store:update",
        ),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      const error =
        Exit.isFailure(exit) && exit.cause._tag === "Fail" ?
          exit.cause.error
        : undefined;
      expect(error).toBeInstanceOf(PermissionDeniedError);
    });

    it("always denies a disabled membership, even an owner", () => {
      const exit = Effect.runSyncExit(
        requirePermission({ role: "owner", status: "disabled" }, "store:read"),
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
