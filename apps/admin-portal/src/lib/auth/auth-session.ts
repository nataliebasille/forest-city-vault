import { Headers as RequestHeaders } from "@forest-city-vault/platform-nextjs-effect";
import { Data, Effect, Option } from "effect";
import { getAuth } from "./auth";
import { toRequestHeaders } from "./request-headers";

/** Reading the session failed unexpectedly (e.g. the database was unreachable). */
export class AuthSessionError extends Data.TaggedError(
  "admin-portal/AuthSessionError",
)<{ readonly cause: unknown }> {}

/**
 * Per-request handle to Better Auth. Built from the request {@link RequestHeaders}
 * (so it reads the caller's session cookie), it exposes
 * {@link AuthSession.currentUser} — the verified user, or `None` when the caller
 * is anonymous.
 *
 * This is the replacement for the old `SupabaseAuth` service. Where that made a
 * network round-trip to Supabase to validate the token, `auth.api.getSession`
 * verifies the session against the portal's own Postgres, so there is no external
 * dependency on the request path.
 */
export class AuthSession extends Effect.Service<AuthSession>()(
  "admin-portal/AuthSession",
  {
    effect: Effect.gen(function* () {
      const requestHeaders = yield* RequestHeaders;

      return {
        currentUser: Effect.tryPromise({
          try: () =>
            getAuth().api.getSession({
              headers: toRequestHeaders(requestHeaders),
            }),
          catch: (cause) => new AuthSessionError({ cause }),
        }).pipe(
          Effect.map((session) =>
            Option.fromNullable(session?.user).pipe(
              Option.map((user) => ({
                id: user.id,
                email: user.email,
              })),
            ),
          ),
        ),
      };
    }),
  },
) {}
