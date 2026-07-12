import { FetchHttpClient } from "@effect/platform";
import { SystemClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { SystemIdGenerator } from "@forest-city-vault/core-id-generator";
import {
  databaseSagaScoped,
  DatabaseLive,
} from "@forest-city-vault/infrastructure-database";
import { Layer } from "effect";
import { CloverAuthToken } from "../integration/auth";

/**
 * Services shared by every Clover route, regardless of how the {@link Database}
 * is provided. Kept separate so the transactional and pooled app layers below
 * differ *only* in their database wiring.
 */
const AppCommon = Layer.mergeAll(
  CloverConfig.Default,
  SystemClock,
  SystemIdGenerator,
  FetchHttpClient.layer,
  CloverAuthToken.Default,
);

/**
 * Production dependency layer for Clover routes.
 *
 * The {@link Database} is provided **saga-scoped**: `databaseSagaScoped` opens a
 * transaction (on a connection from `DatabaseLive`'s pool) and exposes the
 * transaction-bound `Database`, enlisting it as a participant of the ambient
 * saga. Because every route runs inside `withSaga` (see `defineRoute`), this
 * layer is built inside the request's saga — so each request gets its own
 * transaction that the saga commits on success or rolls back on any failure,
 * defect or interruption. Handlers simply `yield* Database` and get that
 * transaction; the saga scoping is automatic and requires no route changes.
 *
 * The residual `Saga` requirement is satisfied by the `withSaga` wrapper inside
 * `defineRoute`.
 *
 * Kept in its own module so tests can swap it via `mock.module` without ever
 * constructing the production resources.
 */
export const AppLive = Layer.merge(
  AppCommon,
  databaseSagaScoped.pipe(Layer.provide(DatabaseLive)),
).pipe(Layer.orDie);

/**
 * Dependency layer for routes that must **not** run inside one enclosing request
 * transaction. The {@link Database} is the base pool database (not a saga
 * participant), so `withSaga` has nothing to commit or roll back at the request
 * level.
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
