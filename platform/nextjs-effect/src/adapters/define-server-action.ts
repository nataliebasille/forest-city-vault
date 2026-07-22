import { Saga, withSaga } from "@forest-city-vault/platform-saga";
import { Effect, Layer } from "effect";
import { MustBeNever } from "../types.internal";
import { toSafeErrorDetails } from "./error-details.internal";
import { buildRequestStateLayer, RequestStateDeps } from "./request/layer";

/**
 * A pure wrapper applied around a server action. It typically leaves the success
 * and error channels intact (the value the action resolves with is the value the
 * server action returns) while enriching the requirement channel — for example
 * reading a request-trace service to annotate every log the handler emits.
 */
type ServerActionMiddleware = (
  self: Effect.Effect<unknown, unknown, unknown>,
) => Effect.Effect<unknown, unknown, unknown>;

const identityTransform: ServerActionMiddleware = (next) => next;

const ServerActionOverride = Symbol.for(
  "platform-nextjs-effect/ServerActionOverride",
);

/**
 * A server action produced by {@link defineServerAction}. It is callable as a
 * Next.js server action `(...args) => Promise<A>` and additionally carries a
 * hidden seam ({@link ServerActionOverride}) that {@link testServerAction} uses
 * to run the same pipeline against replacement layers.
 */
export type ServerActionHandler<Args extends readonly unknown[], A, LOut> = ((
  ...args: Args
) => Promise<A>) & {
  readonly [ServerActionOverride]: (
    layer: Layer.Layer<LOut, unknown, Saga | RequestStateDeps>,
    requestState: Layer.Layer<RequestStateDeps, unknown, never>,
    args: Args,
  ) => Promise<A>;
};

/**
 * Creates a server-action factory bound to a dependency `layer` (and optional
 * `middleware`). The returned function wraps a handler into an `async` server
 * action `(...args) => Promise<A>`.
 *
 * This is the server-action analog of `defineRoute`. Where a route receives a
 * `NextRequest` and returns a `Response`, a server action receives its own
 * argument list (e.g. `(prevState, formData)` for `useActionState`) and resolves
 * with the handler's value. Request state (`Headers`, `Cookies`, …) is read from
 * the ambient Next.js request via `next/headers`, so the `layer` — and any
 * `middleware` — may `yield* Headers` to, for example, recover or mint a request
 * id and expose it as a service the handler carries.
 *
 * Wiring, from the handler outwards:
 *  1. `middleware` wraps the handler, so it can annotate logs (e.g. with a
 *     request id) around everything the handler does.
 *  2. `layer` is provided, satisfying the handler's and middleware's services.
 *     The layer may require request-state services (provided below) and may
 *     require {@link Saga} (satisfied next).
 *  3. {@link withSaga} opens one scope per invocation and provides `Saga`, so a
 *     handler may require `Saga` without it counting as a missing dependency.
 *  4. The page request-state layer is provided (backed by `next/headers`).
 *
 * The boundary logs one lifecycle line per invocation — `serverAction.completed`
 * on success, `serverAction.failed` on a typed failure, `serverAction.defect` on
 * an unexpected defect — each tagged with the action `name`. A typed failure or
 * defect is re-raised, so `Effect.runPromise` rejects and the failure surfaces to
 * Next.js; a handler that must return a graceful value should catch its own
 * expected errors and resolve with a value.
 *
 * The `layer` is kept as a distinct, replaceable input so tests can swap it via
 * {@link testServerAction} without the production layer ever being constructed.
 */
export function defineServerAction<LOut, LErr>(config: {
  layer: Layer.Layer<LOut, LErr, Saga | RequestStateDeps>;
  middleware?: ServerActionMiddleware;
}): <Args extends readonly unknown[], A, E, R>(
  name: string,
  action: (
    ...args: Args
  ) => Effect.Effect<A, E, R> &
    MustBeNever<Exclude<R, LOut | RequestStateDeps | Saga>>,
) => ServerActionHandler<Args, A, LOut> {
  const middleware = config.middleware ?? identityTransform;

  return ((
    name: string,
    action: (...args: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
  ): ServerActionHandler<unknown[], unknown, unknown> => {
    const run = (
      layer: Layer.Layer<unknown, unknown, Saga | RequestStateDeps>,
      requestState: Layer.Layer<RequestStateDeps, unknown, never>,
      args: unknown[],
    ) => {
      const startedAt = Date.now();
      const actionContext = { serverAction: name };

      return Effect.runPromise(
        middleware(action(...args)).pipe(
          Effect.provide(layer),
          withSaga,
          Effect.provide(requestState),
          Effect.tapBoth({
            onFailure: (error) =>
              Effect.logError("serverAction.failed", {
                ...actionContext,
                durationMs: Date.now() - startedAt,
                failureDisposition: "expected_terminal",
                error: toSafeErrorDetails(error),
              }),
            onSuccess: () =>
              Effect.logInfo("serverAction.completed", {
                ...actionContext,
                durationMs: Date.now() - startedAt,
              }),
          }),
          Effect.tapDefect((cause) =>
            Effect.logError("serverAction.defect", {
              ...actionContext,
              durationMs: Date.now() - startedAt,
              failureDisposition: "unexpected_defect",
              error: toSafeErrorDetails(cause),
            }),
          ),
        ) as unknown as Effect.Effect<unknown, unknown, never>,
      );
    };

    const actionFn = ((...args: unknown[]) =>
      run(
        config.layer as Layer.Layer<unknown, unknown, Saga | RequestStateDeps>,
        buildRequestStateLayer("page"),
        args,
      )) as ServerActionHandler<unknown[], unknown, unknown>;

    (actionFn as { [ServerActionOverride]: typeof run })[ServerActionOverride] =
      run;

    return actionFn;
  }) as ReturnType<typeof defineServerAction<LOut, LErr>>;
}

/**
 * Runs a {@link defineServerAction} handler with replacement layers.
 *
 * The production `layer` bound in `defineServerAction` is not referenced, so its
 * resources are never acquired. `options.layer` must cover the same service
 * surface (`LOut`) as the production layer. `options.requestState` replaces the
 * `next/headers`-backed request state, which is unavailable outside a real
 * Next.js request; supply a layer that provides `Headers`, `Cookies` and `Body`.
 */
export function testServerAction<Args extends readonly unknown[], A, LOut>(
  action: ServerActionHandler<Args, A, LOut>,
  options: {
    layer: Layer.Layer<LOut, unknown, Saga | RequestStateDeps>;
    requestState: Layer.Layer<RequestStateDeps, unknown, never>;
  },
) {
  return (...args: Args) =>
    action[ServerActionOverride](options.layer, options.requestState, args);
}
