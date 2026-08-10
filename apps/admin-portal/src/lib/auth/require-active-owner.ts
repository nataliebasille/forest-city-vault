import {
  type MembershipDisabledError,
  type PermissionDeniedError,
  requirePermission,
} from "@forest-city-vault/domain";
import {
  BOOTSTRAP_STORE_ID,
  StoreMembershipQueries,
} from "@forest-city-vault/infrastructure-database";
import {
  forbidden,
  unauthorized,
} from "@forest-city-vault/platform-nextjs-effect";
import { Effect, Option } from "effect";
import type { CurrentUserValue } from "./current-user";
import { AuthSession } from "./auth-session";

/**
 * The `privatePage` gate. Resolves the visitor to a {@link CurrentUserValue} or
 * fails with an `HttpResult` the page factory turns into a `/login` redirect:
 *
 *  - no Better Auth session         → `unauthorized` (401),
 *  - no membership for the email     → `forbidden` (403),
 *  - membership disabled / lacking   → `forbidden` (403, via `requirePermission`).
 *
 * Authorization is keyed on the session's verified **email**, not the identity
 * provider's user id: Better Auth proves email ownership, and the active
 * `store_memberships` row for that email is what actually grants access. It
 * reuses the domain `requirePermission` against the bootstrap store's
 * membership; `owner` is the only role today and holds every permission, so a
 * passing check means "an active owner", with `"store"` the coarse gate for
 * reaching the admin portal at all.
 */
export const requireActiveOwner = Effect.gen(function* () {
  const session = yield* AuthSession;

  const user = yield* session.currentUser;
  if (Option.isNone(user)) {
    return yield* unauthorized("No active session.");
  }

  const membership = yield* StoreMembershipQueries.findByStoreAndEmail(
    BOOTSTRAP_STORE_ID,
    user.value.email,
  );
  if (Option.isNone(membership)) {
    return yield* forbidden("No membership in the store.");
  }

  const { snapshot } = membership.value;

  // `requirePermission` returns a union of `Effect`s (void vs. each failure), so
  // bind it to a single `Effect` type before piping.
  const authorize: Effect.Effect<
    void,
    MembershipDisabledError | PermissionDeniedError
  > = requirePermission(
    { role: snapshot.role, status: snapshot.status },
    "store",
  );

  yield* authorize.pipe(
    Effect.catchAll((error) =>
      forbidden(
        error._tag === "domain/Permissions/MembershipDisabledError" ?
          "Membership is disabled."
        : "Insufficient permissions.",
      ),
    ),
  );

  return {
    id: user.value.id,
    email: snapshot.email,
    role: snapshot.role,
    status: snapshot.status,
  } satisfies CurrentUserValue;
});
