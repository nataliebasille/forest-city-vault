import { AuthConfig } from "@forest-city-vault/core-config";
import {
  BOOTSTRAP_STORE_ID,
  parseConnectionString,
} from "@forest-city-vault/infrastructure-database";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  storeMemberships,
} from "@forest-city-vault/infrastructure-database/schema";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Data, Effect, Redacted } from "effect";
import { after } from "next/server";
import { Pool } from "pg";
import {
  type AuthEmailTransport,
  sendMagicLinkEmail,
} from "./auth-email";
import { type RequestHeaderSource, toRequestHeaders } from "./request-headers";

/**
 * Magic links are short-lived and single-use; 10 minutes balances safety and UX.
 * Declared before {@link auth} because {@link makeAuth} reads it while the
 * singleton is materialized at module load (a `const` is not hoisted).
 */
const MAGIC_LINK_TTL_SECONDS = 600;

/**
 * The admin portal's Better Auth instance — the replacement for Supabase Auth.
 * It owns passwordless magic-link sign-in end to end: generating and hashing the
 * single-use token (`storeToken: "hashed"`), emailing the link via Resend, and
 * issuing/verifying its own session cookie against the Postgres tables the
 * Drizzle adapter manages. No external auth server, no per-request round-trip.
 *
 * Built **lazily** on first use — not at module load — and then memoized as a
 * process-wide singleton. Laziness matters for production: `next build` runs with
 * `NODE_ENV=production` and evaluates the `/api/auth/[...all]` route module while
 * collecting page data, so building the instance at import time would resolve the
 * production email transport and demand `RESEND_API_KEY` *at build time* (it
 * failed exactly this way). Deferring construction to the first request means the
 * config — including that env-derived transport — is read at runtime, where the
 * secret actually lives. The instance still owns a connection pool that lives for
 * the process, so it is created once and reused.
 *
 * Consumers talk to it through Effects: {@link signInWithMagicLink} /
 * {@link signOut} here, and `AuthSession.currentUser` for reading the session.
 * Constructing it fails loudly if configuration is missing (a `ConfigError`
 * surfaced from the request that first builds it).
 */
export function getAuth() {
  return (cachedAuth ??= buildAuth());
}

let cachedAuth: ReturnType<typeof buildAuth> | undefined;

function buildAuth() {
  return Effect.runSync(Effect.provide(makeAuth(), AuthConfig.Default));
}

/** Requesting a magic link failed. `statusCode` is Better Auth's HTTP status when present (e.g. 429). */
export class MagicLinkRequestError extends Data.TaggedError(
  "admin-portal/MagicLinkRequestError",
)<{ readonly statusCode: number | undefined; readonly cause: unknown }> {}

/** Ending the session failed. */
export class SignOutError extends Data.TaggedError(
  "admin-portal/SignOutError",
)<{ readonly cause: unknown }> {}

/**
 * Requests a passwordless sign-in link for `email`, as an Effect. Always succeeds
 * for a well-formed, provisioned email; the link is only actually emailed when
 * the address has an active membership (see {@link makeAuth}'s `sendMagicLink`),
 * so callers get no signal about which emails exist. A rate limit surfaces as a
 * {@link MagicLinkRequestError} carrying `statusCode: 429`.
 */
export function signInWithMagicLink(
  requestHeaders: RequestHeaderSource,
  input: { readonly email: string },
) {
  return Effect.tryPromise({
    try: () =>
      getAuth().api.signInMagicLink({
        body: {
          email: input.email,
          callbackURL: "/",
          errorCallbackURL: "/login",
        },
        headers: toRequestHeaders(requestHeaders),
      }),
    catch: (cause) =>
      new MagicLinkRequestError({
        statusCode: cause instanceof APIError ? cause.statusCode : undefined,
        cause,
      }),
  });
}

/** Ends the caller's session, as an Effect, clearing the session cookie. */
export function signOut(requestHeaders: RequestHeaderSource) {
  return Effect.tryPromise({
    try: () =>
      getAuth().api.signOut({ headers: toRequestHeaders(requestHeaders) }),
    catch: (cause) => new SignOutError({ cause }),
  });
}

/**
 * Builds the Better Auth instance from injected {@link AuthConfig}. Kept as an
 * Effect so configuration flows through the app's `Config` layer (redacted
 * secrets, defaults, `ConfigError` on missing values) rather than ad-hoc
 * `process.env` reads.
 *
 * To keep the portal invite-only we refuse sign-in for any email without an
 * active membership in two places: we never email a link to a non-member (in
 * `sendMagicLink`), and we abort user creation for a non-member in the
 * `user.create.before` hook as defense in depth. `nextCookies()` is intentionally
 * the LAST plugin so it turns the framework's `Set-Cookie` into Next.js cookie
 * writes for server actions / route handlers.
 */
function makeAuth() {
  return Effect.gen(function* () {
    const config = yield* AuthConfig;
    const db = createAuthDb(config.databaseUrl);
    const emailTransport = toEmailTransport(config);

    return betterAuth({
      secret: Redacted.value(config.secret),
      baseURL: config.baseUrl,
      database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
          user: authUser,
          session: authSession,
          account: authAccount,
          verification: authVerification,
        },
      }),
      emailAndPassword: { enabled: false },
      databaseHooks: {
        user: {
          create: {
            before: async (user) =>
              (await Effect.runPromise(hasActiveMembership(db, user.email))) ?
                undefined
              : false,
          },
        },
      },
      plugins: [
        magicLink({
          expiresIn: MAGIC_LINK_TTL_SECONDS,
          storeToken: "hashed",
          sendMagicLink: async ({ email, url }) => {
            // Don't reveal which emails are provisioned. Two things matter:
            // silently skip non-members (no email), and keep the two branches
            // time-symmetric. Awaiting the email round-trip only for members
            // would leak membership by timing, so we schedule the send with
            // `after()` to run once the response is sent — both members and
            // non-members return immediately after the same local check.
            if (!(await Effect.runPromise(hasActiveMembership(db, email)))) {
              return;
            }
            after(() =>
              Effect.runPromise(
                sendMagicLinkEmail(emailTransport, { to: email, url }),
              ),
            );
          },
        }),
        nextCookies(),
      ],
    });
  });
}

/**
 * Adapts the {@link AuthConfig} email transport (the environment-derived
 * decision plus its credentials) into the shape {@link sendMagicLinkEmail}
 * expects, attaching the shared `from` address. The SMTP-vs-Resend choice already
 * happened in config; this only reshapes it.
 */
function toEmailTransport(config: AuthConfig): AuthEmailTransport {
  return config.emailTransport.kind === "smtp" ?
      {
        kind: "smtp",
        url: config.emailTransport.url,
        from: config.emailFrom,
      }
    : {
        kind: "resend",
        apiKey: config.emailTransport.apiKey,
        from: config.emailFrom,
      };
}

/**
 * Whether `email` has an active membership in the bootstrap store, as an Effect.
 * Matched case-insensitively because Better Auth normalizes sign-in emails to
 * lowercase while a membership row preserves whatever case it was created with.
 */
function hasActiveMembership(
  db: ReturnType<typeof createAuthDb>,
  email: string,
) {
  return Effect.promise(async () => {
    const rows = await db
      .select({ id: storeMemberships.id })
      .from(storeMemberships)
      .where(
        and(
          eq(storeMemberships.storeId, BOOTSTRAP_STORE_ID),
          eq(sql`lower(${storeMemberships.email})`, email.toLowerCase()),
          eq(storeMemberships.status, "active"),
        ),
      )
      .limit(1);

    return rows.length > 0;
  });
}

/**
 * A plain `node-postgres` Drizzle instance for Better Auth's adapter and the
 * membership lookups above. Deliberately separate from the app's
 * `@effect/sql-drizzle` database: Better Auth's adapter expects a standard
 * Drizzle client it can query directly. It reuses {@link parseConnectionString}
 * so TLS is handled identically to the pooled runtime connection.
 */
function createAuthDb(databaseUrl: string) {
  const { url, ssl } = parseConnectionString(databaseUrl);
  const pool = new Pool({ connectionString: url, ssl });
  return drizzle(pool);
}
