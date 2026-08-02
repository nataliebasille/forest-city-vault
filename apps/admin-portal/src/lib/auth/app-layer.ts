import { SupabaseConfig } from "@forest-city-vault/core-config";
import { DatabaseLive } from "@forest-city-vault/infrastructure-database";
import { Layer } from "effect";
import { SupabaseAuth } from "./supabase-auth";

/**
 * The admin portal's base dependency layer: the pooled {@link DatabaseLive} and
 * a per-request {@link SupabaseAuth}, with {@link SupabaseConfig} provided to
 * both. It requires only the request `Cookies` (part of the platform's
 * request-state), which `definePage` supplies per request. This is the layer
 * behind `publicPage`; `privatePage` extends it with a resolved `CurrentUser`.
 */
export const AppLive = Layer.mergeAll(DatabaseLive, SupabaseAuth.Default).pipe(
  Layer.provide(SupabaseConfig.Default),
);
