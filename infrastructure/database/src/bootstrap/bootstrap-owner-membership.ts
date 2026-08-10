import { IdGenerator } from "@forest-city-vault/core-id-generator";
import { StoreMembership } from "@forest-city-vault/domain";
import { Effect, Option } from "effect";
import { StoreMembershipQueries } from "../repositories/store-memberships";

export type BootstrapOwnerMembershipInput = {
  readonly storeId: string;
  readonly email: string;
};

export type BootstrapOwnerMembershipResult = {
  readonly membershipId: string;
  readonly created: boolean;
};

/**
 * Ensures an owner membership exists for `(storeId, email)`, idempotently.
 *
 * - No membership for the email → create one with the `owner` role via the
 *   `StoreMembership` aggregate and repository, returning `created: true`.
 * - A membership already exists → no-op, returning `created: false` and the
 *   existing membership id.
 *
 * Idempotency keys off the **email** (via
 * {@link StoreMembershipQueries.findByStoreAndEmail}), because email is the admin
 * portal's auth gate key: the identity provider (Better Auth) proves email
 * ownership on sign-in, and this membership — matched by email — is what grants
 * access. The `user_id` column is filled with a generated id purely to satisfy
 * its NOT NULL constraint; it is an opaque placeholder, decoupled from the auth
 * provider's user id, and nothing reads it for authorization.
 */
export const bootstrapOwnerMembership = (
  input: BootstrapOwnerMembershipInput,
) =>
  Effect.gen(function* () {
    const existing = yield* StoreMembershipQueries.findByStoreAndEmail(
      input.storeId,
      input.email,
    );

    if (Option.isSome(existing)) {
      return {
        membershipId: String(existing.value.id),
        created: false,
      } satisfies BootstrapOwnerMembershipResult;
    }

    const idGenerator = yield* IdGenerator;
    const membershipId = yield* idGenerator.next;
    const userId = yield* idGenerator.next;

    const created = yield* StoreMembership.actions.create(
      StoreMembership.pristine(membershipId),
      {
        storeId: input.storeId,
        userId,
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
