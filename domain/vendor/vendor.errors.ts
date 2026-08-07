import { Data } from "effect";

/**
 * A vendor name was blank (empty or whitespace-only). Names are always trimmed
 * before this check, so a name of only spaces is rejected the same as "".
 */
export class VendorNameBlankError extends Data.TaggedError(
  "domain/Vendor/VendorNameBlankError",
)<{}> {}

/**
 * A vendor commission share was outside the valid 0..10000 basis-point range
 * (0%..100%).
 */
export class VendorCommissionShareOutOfRangeError extends Data.TaggedError(
  "domain/Vendor/VendorCommissionShareOutOfRangeError",
)<{ readonly commissionShare: number }> {}

/** A vendor was linked to a blank (empty or whitespace-only) Clover category id. */
export class VendorCloverCategoryBlankError extends Data.TaggedError(
  "domain/Vendor/VendorCloverCategoryBlankError",
)<{}> {}

/** Tried to activate a vendor that is already active. */
export class VendorAlreadyActiveError extends Data.TaggedError(
  "domain/Vendor/VendorAlreadyActiveError",
)<{}> {}

/** Tried to deactivate a vendor that is already inactive. */
export class VendorAlreadyInactiveError extends Data.TaggedError(
  "domain/Vendor/VendorAlreadyInactiveError",
)<{}> {}
