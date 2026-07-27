import { IdGenerator } from "@forest-city-vault/core-id-generator";
import { StoreMembership } from "@forest-city-vault/domain";
import { Effect, Option } from "effect";
import { StoreMembershipQueries } from "../repositories/store-memberships";

export type BootstrapOwnerMembershipInput = {
  readonly storeId: string;
  readonly userId: string;
  readonly email: string;
};

export type BootstrapOwnerMembershipResult = {
  readonly membershipId: string;
  readonly created: boolean;
};

/**
 * Ensures an owner membership exists for `(storeId, userId)`, idempotently.
 *
 * - No membership for the pair → create one with the `owner` role via the
 *   `StoreMembership` aggregate and repository, returning `created: true`.
 * - A membership already exists → no-op, returning `created: false` and the
 *   existing membership id.
 *
 * Idempotency keys off the `(store_id, user_id)` unique index via
 * {@link StoreMembershipQueries.findByStoreAndUser}, so a re-run with the same
 * store and user never creates a second membership (and could never, since the
 * unique constraint would reject it).
 */
export const bootstrapOwnerMembership = (
  input: BootstrapOwnerMembershipInput,
) =>
  Effect.gen(function* () {
    const existing = yield* StoreMembershipQueries.findByStoreAndUser(
      input.storeId,
      input.userId,
    );

    if (Option.isSome(existing)) {
      return {
        membershipId: String(existing.value.id),
        created: false,
      } satisfies BootstrapOwnerMembershipResult;
    }

    const idGenerator = yield* IdGenerator;
    const membershipId = yield* idGenerator.next;

    const created = yield* StoreMembership.actions.create(
      StoreMembership.pristine(membershipId),
      {
        storeId: input.storeId,
        userId: input.userId,
        email: input.email,
        role: "owner",
      },
    );

    yield* StoreMembership.repository.save(created);

    return {
      membershipId,
      created: true,
    } satisfies BootstrapOwnerMembershipResult;
  });
