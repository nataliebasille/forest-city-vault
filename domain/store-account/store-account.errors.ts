import { Data } from "effect";

/**
 * A store name was blank (empty or whitespace-only). Names are always trimmed
 * before this check, so a name of only spaces is rejected the same as "".
 */
export class StoreNameBlankError extends Data.TaggedError(
  "domain/StoreAccount/StoreNameBlankError",
)<{}> {}

/** A store time zone was blank (empty or whitespace-only). */
export class StoreTimeZoneBlankError extends Data.TaggedError(
  "domain/StoreAccount/StoreTimeZoneBlankError",
)<{}> {}

/** Tried to activate a store that is already active. */
export class StoreAlreadyActiveError extends Data.TaggedError(
  "domain/StoreAccount/StoreAlreadyActiveError",
)<{}> {}

/** Tried to deactivate a store that is already inactive. */
export class StoreAlreadyInactiveError extends Data.TaggedError(
  "domain/StoreAccount/StoreAlreadyInactiveError",
)<{}> {}
