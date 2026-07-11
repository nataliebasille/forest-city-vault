import { defineRoute } from "@forest-city-vault/platform-nextjs-effect";
import { AppLive, AppLivePooled } from "./live";
import { RequestTraceMiddleware } from "./middleware/request-trace";

export { AppLive } from "./live";

/**
 * The default route factory. Every request runs inside one saga-scoped database
 * transaction: `AppLive` provides the {@link Database} saga-scoped, so the
 * handler's writes commit together on success — or roll back together on any
 * failure, defect or interruption. Handlers get this atomicity for free.
 */
export const route = defineRoute({
  layer: AppLive,
  middleware: RequestTraceMiddleware,
});

/**
 * Route factory for handlers that manage their own transactions and therefore
 * must NOT run inside one enclosing request transaction. `AppLivePooled` provides
 * the base pool {@link Database}, so `withSaga` has no request-level participant.
 *
 * Used by inbox drains: `drain` runs each message as its own saga (its own
 * transaction) and, when a message rolls back, records the failure on a separate
 * pooled connection that survives that rollback.
 */
export const pooledRoute = defineRoute({
  layer: AppLivePooled,
  middleware: RequestTraceMiddleware,
});
