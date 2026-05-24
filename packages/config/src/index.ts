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
