import { SupabaseConfig } from "@forest-city-vault/core-config";
import { Cookies } from "@forest-city-vault/platform-nextjs-effect";
import { createServerClient } from "@supabase/ssr";
import { Data, Effect, Option } from "effect";

/** A verified Supabase auth user, narrowed to what the auth gate needs. */
export type AuthUser = {
  readonly id: string;
  readonly email: string | undefined;
};

/** The Supabase auth server could not be reached to verify the session. */
export class SupabaseAuthError extends Data.TaggedError(
  "admin-portal/SupabaseAuthError",
)<{ readonly cause: unknown }> {}

/**
 * Per-request handle to Supabase Auth. Built from {@link SupabaseConfig} and the
 * request {@link Cookies} (so it reads the caller's session), it exposes
 * {@link SupabaseAuth.currentUser} — the verified user, or `None` when the caller
 * is anonymous.
 *
 * The cookie store is read-only here: a Server Component render cannot write
 * `Set-Cookie`, so token refreshes are left to the proxy / route handlers, and
 * `setAll` is a no-op. `getUser()` still round-trips to the Supabase Auth server
 * to validate the token, so an expired or forged session resolves to `None`.
 */
export class SupabaseAuth extends Effect.Service<SupabaseAuth>()(
  "admin-portal/SupabaseAuth",
  {
    effect: Effect.gen(function* () {
      const config = yield* SupabaseConfig;
      const cookieStore = yield* Cookies;

      const client = createServerClient(config.url, config.anonKey, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      });

      return {
        currentUser: Effect.tryPromise({
          try: () => client.auth.getUser(),
          catch: (cause) => new SupabaseAuthError({ cause }),
        }).pipe(
          Effect.map(({ data }) =>
            Option.fromNullable(data.user).pipe(
              Option.map(
                (user): AuthUser => ({ id: user.id, email: user.email }),
              ),
            ),
          ),
        ),
      };
    }),
  },
) {}
