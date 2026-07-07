import { defineRoute } from "@forest-city-vault/platform-nextjs-effect";
import { Effect } from "effect";
import { AppLive } from "./live";
import { RequestTraceMiddleware } from "./middleware/request-trace";
import { SagaMiddleware } from "./middleware/saga";

export { AppLive } from "./live";

/**
 * The composed route middleware.
 *
 * `RequestTraceMiddleware` is outermost so the request-trace context is
 * available to everything it wraps (including the saga's transaction-bound
 * handler), and `SagaMiddleware` wraps the handler so all of its work runs
 * inside one transaction that commits on success and rolls back on failure.
 */
const middleware = <A, E, R>(handler: Effect.Effect<A, E, R>) =>
  RequestTraceMiddleware(SagaMiddleware(handler));

export const route = defineRoute({
  layer: AppLive,
  middleware,
});
