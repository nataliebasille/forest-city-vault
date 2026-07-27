import { Data, Effect } from "effect";
import type { StoreRole } from "../store-membership/store-membership.entity";

/**
 * An operation would leave a store with no active owner. Raised by the
 * owner-preservation policy when disabling — or demoting from `owner` — the last
 * remaining active owner of a store.
 */
export class FinalActiveOwnerError extends Data.TaggedError(
  "domain/policies/FinalActiveOwnerError",
)<{ readonly storeId: string }> {}

/**
 * The current state of the membership an operation targets. `otherActiveOwners`
 * is the number of *other* active-owner memberships in the same store (i.e.
 * excluding this membership), which the application supplies by querying the
 * repository (`countActiveOwners` minus this one) inside the same transaction.
 * Disabled owners are not active owners, so they are never part of this count.
 */
export type OwnerPreservationSubject = {
  readonly storeId: string;
  readonly role: StoreRole;
  readonly status: "active" | "disabled";
  readonly otherActiveOwners: number;
};

/**
 * A cross-aggregate invariant a single `StoreMembership` cannot enforce alone:
 * a store must always retain at least one active owner. This is a pure decision
 * function — the application is responsible for gathering `otherActiveOwners`
 * transactionally (so concurrent mutations cannot both pass the check) and for
 * applying the membership action only after this succeeds.
 */

/**
 * Guards disabling `subject`. Only an *active owner* can be the store's last
 * owner, so any other membership passes freely; an active owner is rejected when
 * no other active owner remains.
 */
export const ensureOwnerPreservedOnDisable = (
  subject: OwnerPreservationSubject,
) =>
  isLastActiveOwner(subject) ?
    Effect.fail(new FinalActiveOwnerError({ storeId: subject.storeId }))
  : Effect.void;

/**
 * Guards changing `subject`'s role to `nextRole`. Demoting the last active owner
 * to any non-owner role is rejected; keeping the `owner` role (or changing a
 * non-owner) is always allowed.
 */
export const ensureOwnerPreservedOnRoleChange = (
  subject: OwnerPreservationSubject,
  nextRole: StoreRole,
) =>
  nextRole !== "owner" && isLastActiveOwner(subject) ?
    Effect.fail(new FinalActiveOwnerError({ storeId: subject.storeId }))
  : Effect.void;

const isLastActiveOwner = (subject: OwnerPreservationSubject) =>
  subject.role === "owner" &&
  subject.status === "active" &&
  subject.otherActiveOwners === 0;
