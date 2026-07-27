import { describe, it } from "node:test";
import { expect } from "expect";
import { StoreMembership, STORE_ROLES, type StoreRole } from "../index";
import {
  MembershipAlreadyActiveError,
  MembershipAlreadyDisabledError,
  MembershipEmailRequiredError,
  MembershipInvalidRoleError,
  MembershipStoreIdRequiredError,
  MembershipUserIdRequiredError,
} from "../index";
import { expectFailure, FIXED_NOW, runAction, runActionExit } from "../testing";

const createMembership = (
  overrides: {
    storeId?: string;
    userId?: string;
    email?: string;
    role?: StoreRole;
  } = {},
) =>
  runAction(
    StoreMembership.actions.create(StoreMembership.pristine("membership-1"), {
      storeId: overrides.storeId ?? "store-1",
      userId: overrides.userId ?? "user-1",
      email: overrides.email ?? "owner@example.com",
      role: overrides.role ?? "owner",
    }),
  );

describe("StoreMembership", () => {
  it("creates an active membership with the given store, user, and role", () => {
    const membership = createMembership();

    expect(membership.version).toBe(1);
    expect(membership.snapshot).toEqual({
      storeId: "store-1",
      userId: "user-1",
      email: "owner@example.com",
      role: "owner",
      status: "active",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
  });

  it("normalizes the email to trimmed lowercase", () => {
    const membership = createMembership({ email: "  Owner@Example.COM  " });

    expect(membership.snapshot.email).toBe("owner@example.com");
  });

  it("rejects a blank storeId", () => {
    const exit = runActionExit(
      StoreMembership.actions.create(StoreMembership.pristine("m-no-store"), {
        storeId: "  ",
        userId: "user-1",
        email: "owner@example.com",
        role: "owner",
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(MembershipStoreIdRequiredError);
  });

  it("rejects a blank userId", () => {
    const exit = runActionExit(
      StoreMembership.actions.create(StoreMembership.pristine("m-no-user"), {
        storeId: "store-1",
        userId: "",
        email: "owner@example.com",
        role: "owner",
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(MembershipUserIdRequiredError);
  });

  it("rejects a blank email", () => {
    const exit = runActionExit(
      StoreMembership.actions.create(StoreMembership.pristine("m-no-email"), {
        storeId: "store-1",
        userId: "user-1",
        email: "   ",
        role: "owner",
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(MembershipEmailRequiredError);
  });

  for (const role of STORE_ROLES) {
    it(`creates a membership with the ${role} role`, () => {
      const membership = createMembership({ role });

      expect(membership.snapshot.role).toBe(role);
    });
  }

  it("rejects an unrecognized role", () => {
    const exit = runActionExit(
      StoreMembership.actions.create(StoreMembership.pristine("m-bad-role"), {
        storeId: "store-1",
        userId: "user-1",
        email: "owner@example.com",
        role: "superuser" as StoreRole,
      }),
    );

    const error = expectFailure(exit);
    expect(error).toBeInstanceOf(MembershipInvalidRoleError);
    expect((error as MembershipInvalidRoleError).role).toBe("superuser");
  });

  it("changes the membership role", () => {
    const changed = runAction(
      StoreMembership.actions.changeRole(createMembership(), {
        role: "manager",
      }),
    );

    expect(changed.snapshot.role).toBe("manager");
    expect(changed.version).toBe(2);
  });

  it("rejects changing to an unrecognized role", () => {
    const exit = runActionExit(
      StoreMembership.actions.changeRole(createMembership(), {
        role: "superuser" as StoreRole,
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(MembershipInvalidRoleError);
  });

  it("disables an active membership", () => {
    const disabled = runAction(
      StoreMembership.actions.disable(createMembership(), undefined),
    );

    expect(disabled.snapshot.status).toBe("disabled");
  });

  it("reactivates a disabled membership", () => {
    const disabled = runAction(
      StoreMembership.actions.disable(createMembership(), undefined),
    );
    const reactivated = runAction(
      StoreMembership.actions.reactivate(disabled, undefined),
    );

    expect(reactivated.snapshot.status).toBe("active");
  });

  it("rejects disabling an already-disabled membership", () => {
    const disabled = runAction(
      StoreMembership.actions.disable(createMembership(), undefined),
    );
    const exit = runActionExit(
      StoreMembership.actions.disable(disabled, undefined),
    );

    expect(expectFailure(exit)).toBeInstanceOf(MembershipAlreadyDisabledError);
  });

  it("rejects reactivating an already-active membership", () => {
    const exit = runActionExit(
      StoreMembership.actions.reactivate(createMembership(), undefined),
    );

    expect(expectFailure(exit)).toBeInstanceOf(MembershipAlreadyActiveError);
  });
});
