import { SystemClock } from "@forest-city-vault/core-clock";
import {
  DatabaseLive,
  QueryableLive,
} from "@forest-city-vault/infrastructure-database";
import { Layer } from "effect";
import { AuthSession } from "../auth/auth-session";

/**
 * The admin portal's base dependency layer, shared by every route, server action
 * and private page: the pooled {@link DatabaseLive} (and the read-only
 * {@link QueryableLive} built on top of it), a per-request {@link AuthSession},
 * and the {@link SystemClock}. It requires only the request `Headers`/`Cookies`
 * (part of the platform's request-state), which the `route`, `serverAction` and
 * `definePage` factories each supply per request.
 */
export const AppLive = Layer.mergeAll(QueryableLive, AuthSession.Default).pipe(
  Layer.provideMerge(Layer.mergeAll(DatabaseLive, SystemClock)),
);
