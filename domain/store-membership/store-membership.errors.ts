import { Data } from "effect";

/** A membership was created without a `storeId`. */
export class MembershipStoreIdRequiredError extends Data.TaggedError(
  "domain/StoreMembership/MembershipStoreIdRequiredError",
)<{}> {}

/** A membership was created without a `userId`. */
export class MembershipUserIdRequiredError extends Data.TaggedError(
  "domain/StoreMembership/MembershipUserIdRequiredError",
)<{}> {}

/** A membership was created without an email address. */
export class MembershipEmailRequiredError extends Data.TaggedError(
  "domain/StoreMembership/MembershipEmailRequiredError",
)<{}> {}

/** A membership was created or changed to an unrecognized role. */
export class MembershipInvalidRoleError extends Data.TaggedError(
  "domain/StoreMembership/MembershipInvalidRoleError",
)<{ readonly role: string }> {}

/** Tried to reactivate a membership that is already active. */
export class MembershipAlreadyActiveError extends Data.TaggedError(
  "domain/StoreMembership/MembershipAlreadyActiveError",
)<{}> {}

/** Tried to disable a membership that is already disabled. */
export class MembershipAlreadyDisabledError extends Data.TaggedError(
  "domain/StoreMembership/MembershipAlreadyDisabledError",
)<{}> {}
