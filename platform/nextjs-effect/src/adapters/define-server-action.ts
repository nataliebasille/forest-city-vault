import { Effect, Layer } from "effect";
import { MustBeNever } from "../types.internal";
import { toSafeErrorDetails } from "./error-details.internal";
import {
  isNextControlFlowCause,
  raisePipelineExit,
} from "./next-signals.internal";
import { buildRequestStateLayer, RequestStateDeps } from "./request/layer";

/**
 * A layer-aware wrapper applied around a server action. Because it runs *inside*
 * the configured layer, its requirement channel is bounded by that layer's
 * `LOut` plus the per-request services (`RequestStateDeps`): it may read any
 * service the layer supplies without `defineServerAction` naming it, and
 * requiring a service the layer does *not* provide is a type error. It typically
 * leaves the success and error channels intact (the value the action resolves
 * with is the value the server action returns) while enriching the requirement
 * channel — for example reading a request-trace service to annotate every log
 * the handler emits.
 */
type ServerActionMiddleware<LOut> = (
  self: Effect.Effect<unknown, unknown, LOut | RequestStateDeps>,
) => Effect.Effect<unknown, unknown, LOut | RequestStateDeps>;

/**
 * The internal, layer-erased view of a {@link ServerActionMiddleware}: the public
 * `config.middleware` is checked against the layer-aware type, but inside the
 * factory we erase `LOut` so the pipeline can apply it to the untyped handler.
 */
type UntypedMiddleware = (
  self: Effect.Effect<unknown, unknown, unknown>,
) => Effect.Effect<unknown, unknown, unknown>;

const identityTransform = <A, E, R>(next: Effect.Effect<A, E, R>) => next;

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
    layer: Layer.Layer<LOut, unknown, RequestStateDeps>,
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
 *     request id) around everything the handler does. Because it is applied
 *     *inside* the layer, a middleware may require services the `layer`
 *     provides.
 *  2. `layer` is provided, satisfying the handler's and middleware's services.
 *     The layer may require request-state services (provided below).
 *  3. The page request-state layer is provided (backed by `next/headers`).
 *
 * `defineServerAction` is deliberately saga-agnostic: it opens no saga and
 * provides no `Saga` service. An action that wants saga semantics (e.g. a
 * request-scoped transaction) composes `withSaga` into its `middleware` and
 * declares its saga-scoped services via `provideSagaScoped` on the `layer`.
 *
 * The boundary logs one lifecycle line per invocation — `serverAction.completed`
 * on success, `serverAction.failed` on a typed failure, `serverAction.defect` on
 * an unexpected defect — each tagged with the action `name`. A typed failure or
 * defect is re-raised so the returned promise rejects and the failure surfaces to
 * Next.js; a handler that must return a graceful value should catch its own
 * expected errors and resolve with a value.
 *
 * An action (or its layer) that redirects or renders `notFound()` calls the
 * `next/navigation` helpers, which throw Next's control-flow signals. Those
 * signals travel the failure channel as defects, but are *not* application
 * defects: the boundary re-raises them as their original error — so Next
 * performs the navigation with the error's `digest` intact — and does not log
 * them as `serverAction.defect`.
 *
 * The `layer` is kept as a distinct, replaceable input so tests can swap it via
 * {@link testServerAction} without the production layer ever being constructed.
 */
export function defineServerAction<LOut, LErr>(config: {
  layer: Layer.Layer<LOut, LErr, RequestStateDeps>;
  middleware?: ServerActionMiddleware<NoInfer<LOut>>;
}): <Args extends readonly unknown[], A, E, R>(
  name: string,
  action: (
    ...args: Args
  ) => Effect.Effect<A, E, R> &
    MustBeNever<Exclude<R, LOut | RequestStateDeps>>,
) => ServerActionHandler<Args, A, LOut> {
  const middleware = (config.middleware ??
    identityTransform) as UntypedMiddleware;

  return ((
    name: string,
    action: (...args: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
  ): ServerActionHandler<unknown[], unknown, unknown> => {
    const run = (
      layer: Layer.Layer<unknown, unknown, RequestStateDeps>,
      requestState: Layer.Layer<RequestStateDeps, unknown, never>,
      args: unknown[],
    ) => {
      const startedAt = Date.now();
      const actionContext = { serverAction: name };

      return Effect.runPromiseExit(
        middleware(action(...args)).pipe(
          Effect.provide(layer),
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
          // A `redirect()`/`notFound()` throw arrives here as a defect, but it is
          // Next control flow, not an action defect: skip the error log and let
          // `raisePipelineExit` re-raise it so Next performs the navigation.
          Effect.tapDefect((cause) =>
            isNextControlFlowCause(cause) ?
              Effect.void
            : Effect.logError("serverAction.defect", {
                ...actionContext,
                durationMs: Date.now() - startedAt,
                failureDisposition: "unexpected_defect",
                error: toSafeErrorDetails(cause),
              }),
          ),
        ) as unknown as Effect.Effect<unknown, unknown, never>,
      ).then(raisePipelineExit);
    };

    const actionFn = ((...args: unknown[]) =>
      run(
        config.layer as Layer.Layer<unknown, unknown, RequestStateDeps>,
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
    layer: Layer.Layer<LOut, unknown, RequestStateDeps>;
    requestState: Layer.Layer<RequestStateDeps, unknown, never>;
  },
) {
  return (...args: Args) =>
    action[ServerActionOverride](options.layer, options.requestState, args);
}
