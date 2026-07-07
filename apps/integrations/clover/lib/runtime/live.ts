import { FetchHttpClient } from "@effect/platform";
import { Saga } from "@forest-city-vault/application-core";
import { SystemClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { SystemIdGenerator } from "@forest-city-vault/core-id-generator";
import {
  databaseSagaScoped,
  DatabaseLive,
  RepositoriesLive,
} from "@forest-city-vault/infrastructure-database";
import { Layer } from "effect";

/**
 * The per-request saga scope, expressed as a single layer.
 *
 * This is the one place `Saga.make` is called: it bundles the fresh {@link Saga}
 * registry together with {@link databaseSagaScoped} (which opens the request's
 * transaction, exposes a transaction-bound `Database` and registers that
 * transaction as a saga participant). Because it is an ordinary layer, it drops
 * into `AppLive` (and the test layer) alongside every other dependency, so a
 * caller of `runSaga`/`SagaMiddleware` never has to provide `Saga.make` — the
 * registry is already in the ambient context. It outputs a `Saga` and a
 * transaction-bound `Database` (which shadows the base one for the request) and
 * only requires a base `Database` to open the transaction on.
 */
export const SagaScopeLive = databaseSagaScoped.pipe(
  Layer.provideMerge(Saga.make),
);

/**
 * The production dependency layer for the Clover integration.
 *
 * Every dependency lives here as a flat sibling — the repositories/event
 * store/event tracker (`RepositoriesLive`) and the {@link SagaScopeLive saga
 * scope} (the `Saga` registry plus the request's transaction-bound `Database`).
 * The repositories resolve `Database` at call time, so they run on whatever
 * `Database` is ambient; inside a request that is the saga's transaction-bound
 * `Database` provided here, so everything commits or rolls back together. The
 * base `Database` (`DatabaseLive`) is fed in underneath purely so the saga scope
 * has a connection to open its transaction on. `SagaMiddleware` then only has to
 * drive the ambient `Saga` — it provides nothing itself.
 */
export const AppLive = Layer.mergeAll(
  CloverConfig.Default,
  SystemClock,
  SystemIdGenerator,
  FetchHttpClient.layer,
  RepositoriesLive,
  SagaScopeLive,
).pipe(Layer.provideMerge(DatabaseLive), Layer.orDie);
