import { describe, it } from "node:test";
import { expect } from "expect";
import { Effect, Exit } from "effect";
import {
  ensureOwnerPreservedOnDisable,
  ensureOwnerPreservedOnRoleChange,
  FinalActiveOwnerError,
  type OwnerPreservationSubject,
} from "../index";

const subject = (
  overrides: Partial<OwnerPreservationSubject> = {},
): OwnerPreservationSubject => ({
  storeId: "store-1",
  role: overrides.role ?? "owner",
  status: overrides.status ?? "active",
  otherActiveOwners: overrides.otherActiveOwners ?? 0,
});

const isSuccess = <A, E>(effect: Effect.Effect<A, E>) =>
  Exit.isSuccess(Effect.runSyncExit(effect));

const failure = <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = Effect.runSyncExit(effect);
  return Exit.isFailure(exit) && exit.cause._tag === "Fail" ?
      exit.cause.error
    : undefined;
};

describe("owner-preservation policy", () => {
  describe("ensureOwnerPreservedOnDisable", () => {
    it("allows disabling a non-owner membership", () => {
      expect(
        isSuccess(ensureOwnerPreservedOnDisable(subject({ role: "manager" }))),
      ).toBe(true);
    });

    it("allows disabling an owner when another active owner exists", () => {
      expect(
        isSuccess(
          ensureOwnerPreservedOnDisable(subject({ otherActiveOwners: 1 })),
        ),
      ).toBe(true);
    });

    it("rejects disabling the final active owner", () => {
      expect(
        failure(
          ensureOwnerPreservedOnDisable(subject({ otherActiveOwners: 0 })),
        ),
      ).toBeInstanceOf(FinalActiveOwnerError);
    });

    it("treats a disabled owner as not the final active owner", () => {
      // A disabled owner is not an active owner, so disabling it (a no-op path)
      // never trips the guard even with no other active owners.
      expect(
        isSuccess(
          ensureOwnerPreservedOnDisable(
            subject({ status: "disabled", otherActiveOwners: 0 }),
          ),
        ),
      ).toBe(true);
    });
  });

  describe("ensureOwnerPreservedOnRoleChange", () => {
    it("allows keeping the owner role", () => {
      expect(
        isSuccess(
          ensureOwnerPreservedOnRoleChange(
            subject({ otherActiveOwners: 0 }),
            "owner",
          ),
        ),
      ).toBe(true);
    });

    it("allows demoting an owner when another active owner exists", () => {
      expect(
        isSuccess(
          ensureOwnerPreservedOnRoleChange(
            subject({ otherActiveOwners: 1 }),
            "manager",
          ),
        ),
      ).toBe(true);
    });

    it("rejects demoting the final active owner to a non-owner role", () => {
      expect(
        failure(
          ensureOwnerPreservedOnRoleChange(
            subject({ otherActiveOwners: 0 }),
            "manager",
          ),
        ),
      ).toBeInstanceOf(FinalActiveOwnerError);
    });
  });
});
