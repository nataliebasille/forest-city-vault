import { Context, Layer } from "effect";
import { Saga } from "./saga";

/**
 * The ambient saga-scoped layer: the {@link Layer} whose services must be
 * **rebuilt fresh for every saga**.
 *
 * A saga-scoped service (a database transaction, its repositories, an event
 * store, …) cannot be built once and shared: each saga needs its own instance
 * so it commits or rolls back independently. Rather than have every call site
 * thread that layer into {@link withSaga} by hand, the application declares it
 * **once at the boundary** via {@link provideSagaScoped}, and {@link withSaga}
 * re-materialises it for each saga it opens — binding the services to that
 * saga's fresh {@link Saga}.
 *
 * It is a {@link Context.Reference} defaulting to {@link Layer.empty}, so a saga
 * with no saga-scoped services (e.g. a pure unit of work) needs no wiring at
 * all: {@link withSaga} simply finds nothing to rebuild.
 */
export class SagaScopedLayer extends Context.Reference<SagaScopedLayer>()(
  "application/SagaScopedLayer",
  { defaultValue: () => Layer.empty as Layer.Layer<never, never, Saga> },
) {}

/**
 * Declares `layer` as the boundary's saga-scoped layer (see
 * {@link SagaScopedLayer}).
 *
 * The returned layer carries `layer` in the ambient {@link SagaScopedLayer}
 * reference so {@link withSaga} can rebuild it per saga. Crucially, it does
 * **not** build `layer` here — building (and therefore opening the transaction,
 * reserving the connection, …) is deferred to each {@link withSaga}, where a
 * fresh {@link Saga} is available. `layer`'s own `Saga` requirement is satisfied
 * there, which is why it is dropped from the result's requirements.
 *
 * At the type level the result *claims* to provide `layer`'s services (`ROut`)
 * so saga bodies type-check against them at the boundary; at runtime those
 * services are supplied by {@link withSaga}. Any base services `layer` needs to
 * build (`RIn`, e.g. the pooled `Database`) must be present in the ambient
 * context when a saga is opened — provide them alongside this layer.
 */
export const provideSagaScoped = <ROut, E, RIn>(
  layer: Layer.Layer<ROut, E, Saga | RIn>,
): Layer.Layer<ROut, never, never> =>
  Layer.succeed(
    SagaScopedLayer,
    layer as unknown as Layer.Layer<never, never, Saga>,
  ) as unknown as Layer.Layer<ROut, never, never>;
