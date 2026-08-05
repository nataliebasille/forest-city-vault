import { SupabaseConfig } from "@forest-city-vault/core-config";
import { SystemClock } from "@forest-city-vault/core-clock";
import {
  DatabaseLive,
  QueryableLive,
} from "@forest-city-vault/infrastructure-database";
import { Layer } from "effect";
import { SupabaseAuth } from "../auth/supabase-auth";

/**
 * The admin portal's base dependency layer, shared by every route, server action
 * and private page: the pooled {@link DatabaseLive} (and the read-only
 * {@link QueryableLive} built on top of it), a per-request {@link SupabaseAuth},
 * and the {@link SystemClock}, with {@link SupabaseConfig} provided to all and —
 * via `provideMerge` — re-exported so handlers that only need config (the
 * magic-link send and the callback exchange) can read it directly. It requires
 * only the request `Cookies` (part of the platform's request-state), which the
 * `route`, `serverAction` and `definePage` factories each supply per request.
 */
export const AppLive = Layer.mergeAll(QueryableLive, SupabaseAuth.Default).pipe(
  Layer.provideMerge(Layer.mergeAll(DatabaseLive, SystemClock)),
  Layer.provideMerge(SupabaseConfig.Default),
);
