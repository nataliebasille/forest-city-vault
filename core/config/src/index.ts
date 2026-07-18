import { Config, Effect } from "effect";

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
    effect: Effect.all({
      appId: Config.string("CLOVER_APP_ID"),
      secretCode: Config.string("CLOVER_SECRET_CODE"),
      webhookAuthCode: Config.string("CLOVER_WEBHOOK_AUTH_CODE"),
      url: Config.string("CLOVER_URL"),
      oauthUrl: Config.string("CLOVER_OAUTH_URL"),
      tokenEncryptionKey: Config.redacted("CLOVER_TOKEN_ENCRYPTION_KEY"),
    }),
  },
) {}

