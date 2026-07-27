import { Clock, SystemClock } from "@forest-city-vault/core-clock";
import {
  IdGenerator,
  SystemIdGenerator,
} from "@forest-city-vault/core-id-generator";
import { provideSagaScoped, withSaga } from "@forest-city-vault/platform-saga";
import { Effect, Layer } from "effect";
import { Database } from "../database";
import { RepositoriesSagaScoped } from "../repositories/index";

/**
 * The services a bootstrap effect may require: the saga-scoped repositories
 * (rebuilt per saga by `withSaga`) plus the clock and id generator the
 * aggregate actions read. `Database` is intentionally absent — repository and
 * query methods resolve it at call time (see `onAmbientDatabase`).
 */
type BootstrapRequirements =
  | Layer.Layer.Success<typeof RepositoriesSagaScoped>
  | Clock
  | IdGenerator;

/**
 * Runs a bootstrap effect inside a single saga transaction against the given
 * base {@link Database} layer.
 *
 * The bootstrap logic uses the aggregate repositories plus the system
 * {@link SystemClock}/{@link SystemIdGenerator}; wrapping it in `withSaga` over
 * {@link RepositoriesSagaScoped} makes each command's snapshot writes and event
 * appends commit atomically (or roll back together on failure). Parameterizing
 * the database layer lets the runnable scripts pass `DatabaseLive` while tests
 * pass an in-memory PGlite layer, reusing exactly the same wiring.
 */
export const runBootstrap = <A, E>(
  effect: Effect.Effect<A, E, BootstrapRequirements>,
  databaseLayer: Layer.Layer<Database>,
) =>
  withSaga(effect).pipe(
    Effect.provide(SystemClock),
    Effect.provide(SystemIdGenerator),
    Effect.provide(provideSagaScoped(RepositoriesSagaScoped)),
    Effect.provide(databaseLayer),
  ) as Effect.Effect<A, E>;
