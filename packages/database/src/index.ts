import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { Effect } from "effect";
import postgres from "postgres";
import { SupabaseConfig } from "@forest-city-vault/config";
import * as schema from "./schema";

export class Database extends Effect.Service<Database>()("Database", {
  effect: Effect.gen(function* () {
    const { url, anonKey, databaseUrl } = yield* SupabaseConfig;
    const client: SupabaseClient = createClient(url, anonKey);
    const sql = postgres(databaseUrl);
    const db: PostgresJsDatabase<typeof schema> = drizzle(sql, { schema });
    return { client, db };
  }),
  dependencies: [SupabaseConfig.Default],
}) {}

export { SupabaseConfig } from "@forest-city-vault/config";
export * from "./schema";
