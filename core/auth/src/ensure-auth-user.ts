import { createClient } from "@supabase/supabase-js";
import { Config, ConfigError, Data, Effect, Option } from "effect";

/**
 * Provisioning an auth user failed for a reason other than the email already
 * having an account — e.g. the Supabase auth server could not be reached, or it
 * rejected the create for a non-idempotent reason. When the email already
 * exists this error is never raised; the existing id is returned instead.
 */
export class AuthUserProvisionError extends Data.TaggedError(
  "AuthUserProvisionError",
)<{
  readonly email: string;
  readonly cause: unknown;
}> {}

/**
 * The slice of the Supabase admin client {@link makeEnsureAuthUser} depends on.
 * Declared structurally (rather than the concrete `SupabaseClient`) so the
 * create-then-reuse logic can be exercised against a fake client in tests,
 * without a real service-role key or a network round-trip. `error` is `unknown`
 * because the only thing we do with a non-null value is treat it as a failure.
 */
export interface SupabaseAuthAdminClient {
  readonly auth: {
    readonly admin: {
      readonly createUser: (attributes: {
        readonly email: string;
        readonly email_confirm?: boolean;
      }) => Promise<{
        readonly data: { readonly user: { readonly id: string } | null };
        readonly error: unknown;
      }>;
      readonly listUsers: (params?: {
        readonly page?: number;
        readonly perPage?: number;
      }) => Promise<{
        readonly data: {
          readonly users: ReadonlyArray<{
            readonly id: string;
            readonly email?: string | null;
          }>;
        };
        readonly error: unknown;
      }>;
    };
  };
}

/**
 * Ensures a Supabase auth user exists for `email` and returns its id,
 * idempotently. Reads exactly the two env vars this admin path needs —
 * `SUPABASE_URL` and the service-role `SUPABASE_SECRET_KEY` — to build an admin
 * client, then delegates to {@link makeEnsureAuthUser}: a first run creates the
 * user (email pre-confirmed), and a re-run with the same email returns the
 * existing id without creating a duplicate.
 *
 * `SUPABASE_URL` is mandatory: creating an auth user talks to the Supabase Auth
 * server, so a Postgres `DATABASE_URL` alone is not enough. Missing config fails
 * loudly as a `ConfigError`. No new environment variable is introduced.
 */
export const ensureAuthUser = (
  email: string,
): Effect.Effect<string, AuthUserProvisionError | ConfigError.ConfigError> =>
  Effect.flatMap(supabaseAuthAdminClient, (client) =>
    makeEnsureAuthUser(client)(email),
  );

/**
 * Builds an idempotent `ensureAuthUser` over a Supabase-like admin client. Kept
 * separate from {@link ensureAuthUser} so the create-then-reuse logic is testable
 * without a real client: it creates the user with `email_confirm: true`, and if
 * the create is rejected (most commonly because the email already has an
 * account) it looks the user up by email and returns that id instead. A create
 * failure with no pre-existing user is genuine and surfaces as an
 * {@link AuthUserProvisionError}.
 */
export const makeEnsureAuthUser =
  (client: SupabaseAuthAdminClient) =>
  (email: string): Effect.Effect<string, AuthUserProvisionError> =>
    Effect.gen(function* () {
      const created = yield* Effect.tryPromise({
        try: () => client.auth.admin.createUser({ email, email_confirm: true }),
        catch: (cause) => new AuthUserProvisionError({ email, cause }),
      });

      if (!created.error && created.data.user) {
        return created.data.user.id;
      }

      const existing = yield* findUserIdByEmail(client, email);
      if (Option.isSome(existing)) {
        return existing.value;
      }

      return yield* new AuthUserProvisionError({
        email,
        cause: created.error ?? new Error("Supabase returned no user"),
      });
    });

/** Page size for the existing-user lookup; Supabase caps `perPage` at 1000. */
const PAGE_SIZE = 1000;

/**
 * A service-role Supabase admin client built from the two env vars this path
 * needs: `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (read via {@link Config}, so
 * they resolve from the process environment / a loaded `.env`). Session
 * persistence and token refresh are disabled: this is a one-shot server-side
 * client that authenticates with the secret key, not a browser session.
 */
const supabaseAuthAdminClient: Effect.Effect<
  SupabaseAuthAdminClient,
  ConfigError.ConfigError
> = Effect.gen(function* () {
  const url = yield* Config.string("SUPABASE_URL");
  const secretKey = yield* Config.string("SUPABASE_SECRET_KEY");

  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Bridge the concrete client to the narrow slice we depend on. The admin API
  // surface (`auth.admin.createUser` / `listUsers`) is present at runtime; the
  // assertion keeps callers coupled to this port rather than the full client.
  return client as unknown as SupabaseAuthAdminClient;
});

/**
 * Finds the id of an existing auth user by `email`, matched case-insensitively.
 * Pages through `listUsers` (which has no server-side email filter) until a match
 * is found or a short final page signals the end of the list.
 */
const findUserIdByEmail = (
  client: SupabaseAuthAdminClient,
  email: string,
): Effect.Effect<Option.Option<string>, AuthUserProvisionError> =>
  Effect.gen(function* () {
    const target = email.trim().toLowerCase();

    for (let page = 1; ; page += 1) {
      const { data, error } = yield* Effect.tryPromise({
        try: () => client.auth.admin.listUsers({ page, perPage: PAGE_SIZE }),
        catch: (cause) => new AuthUserProvisionError({ email, cause }),
      });

      if (error) {
        return yield* new AuthUserProvisionError({ email, cause: error });
      }

      const match = data.users.find(
        (user) => (user.email ?? "").trim().toLowerCase() === target,
      );
      if (match) {
        return Option.some(match.id);
      }

      if (data.users.length < PAGE_SIZE) {
        return Option.none();
      }
    }
  });
