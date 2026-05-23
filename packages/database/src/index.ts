import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Effect } from "effect";
import { SupabaseConfig } from "@forest-city-vault/config";

export class Database extends Effect.Service<Database>()("Database", {
  effect: Effect.gen(function* () {
    const { url, anonKey } = yield* SupabaseConfig;
    const client: SupabaseClient = createClient(url, anonKey);
    return { client };
  }),
  dependencies: [SupabaseConfig.Default],
}) {}

export { SupabaseConfig } from "@forest-city-vault/config";
