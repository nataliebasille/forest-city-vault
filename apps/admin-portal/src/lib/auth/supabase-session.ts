import { SupabaseConfig } from "@forest-city-vault/core-config";
import { createServerClient } from "@supabase/ssr";
import { Data, Effect } from "effect";
import { cookies as nextCookies } from "next/headers";

/**
 * A Supabase Auth call (send magic link / exchange code) failed. `status` is the
 * Supabase HTTP status when the failure came back *from* Supabase (e.g. 429 rate
 * limit); it is absent when the auth server could not be reached at all. Callers
 * decide how loud to be: a rate limit is worth surfacing, an "unknown user" is
 * deliberately swallowed to avoid confirming which emails exist.
 */
export class SupabaseSessionError extends Data.TaggedError(
  "admin-portal/SupabaseSessionError",
)<{
  readonly message: string;
  readonly status?: number;
  readonly cause?: unknown;
}> {}

/**
 * Emails a passwordless magic-link to `email`. `shouldCreateUser: false` keeps
 * the portal invite-only — Supabase never provisions a new user from this call,
 * so only addresses that already have an account can receive a link. The PKCE
 * code-verifier cookie is written during this call (via {@link writableClient}'s
 * `setAll`), to be re-read by the `/auth/callback` exchange.
 *
 * `emailRedirectTo` is the absolute callback URL Supabase appends the auth
 * `code` to; it must be an allowed redirect URL in the Supabase project.
 */
export function sendMagicLink(input: {
  readonly email: string;
  readonly emailRedirectTo: string;
}) {
  return Effect.gen(function* () {
    const client = yield* writableClient;

    const { error } = yield* Effect.tryPromise({
      try: () =>
        client.auth.signInWithOtp({
          email: input.email,
          options: {
            emailRedirectTo: input.emailRedirectTo,
            shouldCreateUser: false,
          },
        }),
      catch: (cause) =>
        new SupabaseSessionError({
          message: "Could not reach the Supabase auth server.",
          cause,
        }),
    });

    if (error) {
      return yield* new SupabaseSessionError({
        message: error.message,
        status: error.status,
        cause: error,
      });
    }
  });
}

/**
 * Exchanges the single-use PKCE `code` from the email link for a session,
 * writing the session cookies via {@link writableClient}'s `setAll`. A missing
 * verifier cookie, or an expired/replayed code, comes back as a Supabase error
 * and is surfaced as a {@link SupabaseSessionError} for the caller to turn into a
 * `/login` redirect.
 */
export function exchangeCodeForSession(code: string) {
  return Effect.gen(function* () {
    const client = yield* writableClient;

    const { error } = yield* Effect.tryPromise({
      try: () => client.auth.exchangeCodeForSession(code),
      catch: (cause) =>
        new SupabaseSessionError({
          message: "Could not reach the Supabase auth server.",
          cause,
        }),
    });

    if (error) {
      return yield* new SupabaseSessionError({
        message: error.message,
        status: error.status,
        cause: error,
      });
    }
  });
}

/**
 * A per-request Supabase client whose cookie store is the *writable* Next.js
 * request cookies (`next/headers`). Unlike the read-only client behind the page
 * auth gate, this one runs only in Server Actions and Route Handlers, where
 * `cookies().set` is allowed — so Supabase can persist the PKCE verifier and the
 * refreshed session onto the response. `setAll`'s optional second `headers`
 * argument (anti-cache hints) is not needed here: the callback route sets
 * `Cache-Control: no-store` itself.
 */
const writableClient = Effect.gen(function* () {
  const config = yield* SupabaseConfig;
  const store = yield* Effect.promise(() => nextCookies());

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          store.set(name, value, options);
        }
      },
    },
  });
});
