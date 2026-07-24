import { defineRoute } from "@forest-city-vault/platform-nextjs-effect";
import { withSaga } from "@forest-city-vault/platform-saga";
import { flow } from "effect/Function";
import { AppLive, AppLivePooled } from "./live";
import { RequestTraceMiddleware } from "./middleware/request-trace";

export { AppLive } from "./live";

/**
 * The default route factory. Composing {@link withSaga} as middleware makes every
 * request run inside one saga-scoped database transaction: `AppLive` provides the
 * {@link Database} saga-scoped, so the handler's writes commit together on success
 * — or roll back together on any failure, defect or interruption. Handlers get
 * this atomicity for free; `defineRoute` itself is saga-agnostic.
 *
 * `flow` composes left-to-right, so `withSaga` is the *outermost* transformation
 * and request tracing runs inside it. Applied by {@link defineRoute} around the
 * layer-provided handler, the effective structure per request is:
 *
 * ```ts
 * withSaga(
 *   RequestTraceMiddleware(
 *     handler.pipe(Effect.provide(AppLive)),
 *   ),
 * );
 * ```
 *
 * Because `AppLive` is provided *inside* `withSaga`, the saga-scoped `Database`
 * transaction is opened within the request's saga.
 */
export const route = defineRoute({
  layer: AppLive,
  middleware: flow(RequestTraceMiddleware, withSaga),
});

/**
 * Route factory for handlers that manage their own transactions and therefore
 * must NOT run inside one enclosing request transaction. It composes only
 * {@link RequestTraceMiddleware} — deliberately *no* `withSaga` — so there is no
 * request-wide saga, and `AppLivePooled` provides the base pool {@link Database}
 * with no request-level participant.
 *
 * Used by inbox drains: `drain` runs each message as its own saga (its own
 * transaction) and, when a message rolls back, records the failure on a separate
 * pooled connection that survives that rollback.
 */
export const pooledRoute = defineRoute({
  layer: AppLivePooled,
  middleware: RequestTraceMiddleware,
});
