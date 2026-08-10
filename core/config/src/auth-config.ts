import { Config, Effect } from "effect";

/**
 * Configuration for the admin portal's Better Auth (passwordless magic-link)
 * sign-in. Secrets are {@link Config.redacted} so they never surface in logs or
 * error output.
 *
 *  - `secret` — signs session cookies and hashes magic-link tokens (required).
 *  - `baseUrl` — absolute origin used to build magic-link callback URLs; defaults
 *    to the local dev port.
 *  - `databaseUrl` — the Postgres URL Better Auth's adapter connects to (the same
 *    database the app uses).
 *  - `emailFrom` — sender address for the sign-in email; defaults to Resend's
 *    shared onboarding sender for local/dev.
 *  - `emailTransport` — how the sign-in email is delivered, **derived from the
 *    environment** rather than the presence of any single variable: production
 *    sends real mail through Resend (`RESEND_API_KEY`), every other environment
 *    routes to a local SMTP inbox — Mailpit — so dev/preview never send real
 *    email. The credentials the chosen transport needs are read as typed config,
 *    so a production deploy missing `RESEND_API_KEY` fails as a `ConfigError`
 *    when the layer is built, not silently at send time.
 */
export class AuthConfig extends Effect.Service<AuthConfig>()("AuthConfig", {
  effect: Effect.gen(function* () {
    const isProduction =
      (yield* Config.string("NODE_ENV").pipe(
        Config.withDefault("development"),
      )) === "production";

    const base = yield* Effect.all({
      secret: Config.redacted("BETTER_AUTH_SECRET"),
      baseUrl: Config.string("BETTER_AUTH_URL").pipe(
        Config.withDefault("http://localhost:3101"),
      ),
      databaseUrl: Config.string("DATABASE_URL"),
      emailFrom: Config.string("AUTH_EMAIL_FROM").pipe(
        Config.withDefault("Forest City Vault <onboarding@resend.dev>"),
      ),
    });

    const emailTransport = yield* authEmailTransport(isProduction);

    return { ...base, emailTransport };
  }),
}) {}

/**
 * The email transport for {@link AuthConfig}, as typed {@link Config}. Production
 * resolves to Resend (requiring `RESEND_API_KEY`); every other environment
 * resolves to SMTP, defaulting to the local Mailpit inbox so dev never sends real
 * mail. `AUTH_SMTP_URL` only tunes *where* dev SMTP points — it no longer decides
 * *which* transport is used, so it cannot accidentally divert production email.
 */
const authEmailTransport = (isProduction: boolean) =>
  isProduction ?
    Config.redacted("RESEND_API_KEY").pipe(
      Config.map((apiKey) => ({ kind: "resend" as const, apiKey })),
    )
  : Config.string("AUTH_SMTP_URL").pipe(
      Config.withDefault("smtp://localhost:54325"),
      Config.map((url) => ({ kind: "smtp" as const, url })),
    );
