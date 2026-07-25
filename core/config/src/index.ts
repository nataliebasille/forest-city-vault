import { Config, ConfigError, Effect, Either } from "effect";

export class SupabaseConfig extends Effect.Service<SupabaseConfig>()(
  "SupabaseConfig",
  {
    effect: Effect.all({
      url: Config.string("SUPABASE_URL"),
      anonKey: Config.string("SUPABASE_ANON_KEY"),
      secretKey: Config.string("SUPABASE_SECRET_KEY"),
      databaseUrl: Config.string("DATABASE_URL"),
    }),
  },
) {}

export class CloverConfig extends Effect.Service<CloverConfig>()(
  "CloverConfig",
  {
    effect: Effect.gen(function* () {
      // `redirect_uri` must be an absolute HTTPS URL in production; sandbox/dev
      // may use http so the flow stays testable without TLS. Production is
      // detected from NODE_ENV (defaults to non-production when unset).
      const nodeEnv = yield* Config.string("NODE_ENV").pipe(
        Config.withDefault("development"),
      );
      const isProduction = nodeEnv === "production";

      const base = yield* Effect.all({
        appId: Config.string("CLOVER_APP_ID"),
        secretCode: Config.string("CLOVER_SECRET_CODE"),
        webhookAuthCode: Config.string("CLOVER_WEBHOOK_AUTH_CODE"),
        processorSecret: Config.redacted("CLOVER_PROCESSOR_SECRET"),
        url: Config.string("CLOVER_URL"),
        oauthUrl: Config.string("CLOVER_OAUTH_URL"),
        tokenEncryptionKey: Config.redacted("CLOVER_TOKEN_ENCRYPTION_KEY"),
        // The single Clover merchant this internal app is allowed to authorize.
        merchantId: Config.string("CLOVER_MERCHANT_ID"),
        // Kept distinct from every other Clover secret so rotating it only
        // invalidates in-progress OAuth attempts (never stored tokens). Never
        // logged, never returned in a response.
        oauthStateSecret: Config.redacted("CLOVER_OAUTH_STATE_SECRET"),
      });

      // Explicit, validated callback URL — never derived from request headers.
      const oauthRedirectUri = yield* Config.string(
        "CLOVER_OAUTH_REDIRECT_URI",
      ).pipe(Config.mapOrFail((raw) => validateRedirectUri(raw, isProduction)));

      return { ...base, oauthRedirectUri };
    }),
  },
) {}

/**
 * Ensures `CLOVER_OAUTH_REDIRECT_URI` is an absolute URL and, in production, an
 * HTTPS one. Returning a `ConfigError` fails app configuration loudly rather
 * than silently binding the OAuth flow to a malformed or insecure callback.
 */
function validateRedirectUri(
  raw: string,
  isProduction: boolean,
): Either.Either<string, ConfigError.ConfigError> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return Either.left(
      ConfigError.InvalidData(
        ["CLOVER_OAUTH_REDIRECT_URI"],
        "must be an absolute URL",
      ),
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return Either.left(
      ConfigError.InvalidData(
        ["CLOVER_OAUTH_REDIRECT_URI"],
        "must be an http or https URL",
      ),
    );
  }

  if (isProduction && parsed.protocol !== "https:") {
    return Either.left(
      ConfigError.InvalidData(
        ["CLOVER_OAUTH_REDIRECT_URI"],
        "must use https in production",
      ),
    );
  }

  return Either.right(raw);
}

export class EmailConfig extends Effect.Service<EmailConfig>()("EmailConfig", {
  effect: Effect.all({
    resendApiKey: Config.redacted("RESEND_API_KEY"),
    toEmail: Config.string("VENDOR_APPLICATION_TO_EMAIL"),
    fromEmail: Config.string("VENDOR_APPLICATION_FROM_EMAIL").pipe(
      Config.withDefault("onboarding@resend.dev"),
    ),
  }),
}) {}
