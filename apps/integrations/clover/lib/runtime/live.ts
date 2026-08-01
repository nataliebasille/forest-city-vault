import { FetchHttpClient } from "@effect/platform";
import { SystemClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { SystemIdGenerator } from "@forest-city-vault/core-id-generator";
import {
  databaseSagaScoped,
  DatabaseLive,
} from "@forest-city-vault/infrastructure-database";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";
import { Layer } from "effect";
import { RequestTraceLayer } from "./middleware/request-trace";

/**
 * Services shared by every Clover route, regardless of how the {@link Database}
 * is provided. Kept separate so the transactional and pooled app layers below
 * differ *only* in their database wiring.
 *
 * Includes {@link RequestTraceLayer} so every route carries a {@link RequestTrace}
 * derived from the request headers — provided as a layer (not middleware) so it
 * satisfies `defineRoute`'s dependency check.
 */
const AppCommon = Layer.mergeAll(
  CloverConfig.Default,
  SystemClock,
  SystemIdGenerator,
  FetchHttpClient.layer,
  RequestTraceLayer,
);

/**
 * Production dependency layer for Clover routes.
 *
 * The {@link Database} is provided **saga-scoped** via `provideSagaScoped`: it
 * declares `databaseSagaScoped` as the boundary's saga-scoped layer, and the
 * `withSaga` middleware the `route` helper composes rebuilds it per request —
 * opening a transaction (on a connection from `DatabaseLive`'s pool), binding the
 * transaction-scoped {@link Database}, and enlisting it as a participant of the
 * request saga. Each request gets its own transaction that the saga commits on
 * success or rolls back on any failure, defect or interruption. Handlers simply
 * `yield* Database` and get that transaction.
 *
 * Because `provideSagaScoped` discharges the `Saga` requirement internally (it is
 * satisfied by the rebuilding `withSaga`, not by `defineRoute`), this layer has
 * no residual `Saga` requirement — which is what lets the saga-agnostic
 * `defineRoute` apply its middleware *inside* the layer. The base
 * `DatabaseLive` pool is provided alongside so `withSaga` can build the
 * per-request transaction.
 *
 * Kept in its own module so tests can swap it via `mock.module` without ever
 * constructing the production resources.
 */
export const AppLive = Layer.mergeAll(
  AppCommon,
  DatabaseLive,
  provideSagaScoped(databaseSagaScoped),
).pipe(Layer.orDie);

/**
 * Dependency layer for routes that must **not** run inside one enclosing request
 * transaction. The {@link Database} is the base pool database (not a saga
 * participant). Paired with the `pooledRoute` helper, which deliberately does not
 * compose `withSaga`, there is no request-level saga to commit or roll back.
 *
 * Used by inbox drains: `drain` runs each message as its own saga (its own
 * transaction) and, when a message rolls back, records the failure on a separate
 * pooled connection that survives that rollback. Wrapping the whole request in a
 * single transaction would nest those per-message transactions and defeat that
 * guarantee, so drain-style routes use this pooled layer instead.
 */
export const AppLivePooled = Layer.merge(AppCommon, DatabaseLive).pipe(
  Layer.orDie,
);
