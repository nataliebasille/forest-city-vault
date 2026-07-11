import { Saga, withSaga } from "@forest-city-vault/platform-saga";
import { Effect, Layer } from "effect";
import { NextRequest } from "next/server";
import { HttpResult, httpResultToResponse } from "../http/http-result";
import { MustBeNever } from "../types.internal";
import { buildRequestStateLayer, RequestStateDeps } from "./request/layer";

const identityTransform = <A, E, R>(next: Effect.Effect<A, E, R>) => next;

const RouteOverride = Symbol.for("platform-nextjs-effect/RouteOverride");

/**
 * A route handler produced by {@link defineRoute}. It is callable as a Next.js
 * route handler `(req) => Promise<Response>` and additionally carries a hidden
 * seam ({@link RouteOverride}) that {@link testRoute} uses to run the same
 * pipeline against a replacement dependency layer.
 */
export type RouteHandler<LOut> = ((req: NextRequest) => Promise<Response>) & {
  readonly [RouteOverride]: (
    req: NextRequest,
    layer: Layer.Layer<LOut, unknown, never>,
  ) => Promise<Response>;
};

/**
 * Creates a route factory bound to a dependency `layer` (and optional pure
 * `middleware`). The returned function wraps a handler into a Next.js route.
 *
 * Every route runs as a single saga: the (optionally middleware-wrapped) handler
 * is wrapped in {@link withSaga}, which opens one scope per request, provides the
 * {@link Saga} service and drives commit/rollback from the request's outcome. A
 * handler may therefore require `Saga` — and provide saga-scoped layers such as a
 * database transaction — without it counting as a missing dependency; it is
 * satisfied here. The saga is the outermost wrapper around the request, so
 * `middleware` runs inside it.
 *
 * The `layer` is kept as a distinct, replaceable input so tests can swap it via
 * {@link testRoute} without the production layer ever being constructed.
 */
export function defineRoute<LOut, LErr, LReq>(config: {
  layer: Layer.Layer<LOut, LErr, LReq>;
}): <A, E, R>(
  action: (
    req: NextRequest,
  ) => Effect.Effect<A, E, R> &
    MustBeNever<Exclude<R, LOut | RequestStateDeps | Saga>>,
) => RouteHandler<LOut>;
export function defineRoute<
  LOut,
  LErr,
  LReq,
  AIn,
  EIn,
  RIn,
  AOut,
  EOut,
  ROut,
>(config: {
  layer: Layer.Layer<LOut, LErr, LReq>;
  middleware: (
    self: Effect.Effect<AIn, EIn, RIn>,
  ) => Effect.Effect<AOut, EOut, ROut>;
}): (
  action: (
    req: NextRequest,
  ) => Effect.Effect<AIn, EIn, RIn> &
    MustBeNever<Exclude<ROut, LOut | RequestStateDeps | Saga>>,
) => RouteHandler<LOut>;
export function defineRoute(config: {
  layer: Layer.Layer<unknown, unknown, unknown>;
  middleware?: (
    self: Effect.Effect<unknown, unknown, unknown>,
  ) => Effect.Effect<unknown, unknown, unknown>;
}) {
  const middleware = config.middleware ?? identityTransform;

  return (
    action: (req: NextRequest) => Effect.Effect<unknown, unknown, unknown>,
  ): RouteHandler<unknown> => {
    const run = (
      req: NextRequest,
      layer: Layer.Layer<unknown, unknown, never>,
    ) =>
      Effect.runPromise(
        action(req).pipe(
          Effect.provide(layer),
          middleware,
          withSaga,
          Effect.provide(buildRequestStateLayer("route", req)),
          Effect.match({
            onFailure: (error) =>
              httpResultToResponse(failureToHttpResult(error)),

            onSuccess: (value) =>
              httpResultToResponse(successToHttpResult(value)),
          }),
        ) as unknown as Effect.Effect<Response, never, never>,
      );

    const routeFn = ((req: NextRequest) =>
      run(
        req,
        config.layer as Layer.Layer<unknown, unknown, never>,
      )) as RouteHandler<unknown>;

    (routeFn as { [RouteOverride]: typeof run })[RouteOverride] = run;

    return routeFn;
  };
}

/**
 * Runs a {@link defineRoute} handler with a replacement dependency layer.
 *
 * The production layer bound in `defineRoute` is not referenced, so its
 * resources are never acquired. `options.layer` must cover the same service
 * surface (`LOut`) as the production layer.
 */
export function testRoute<LOut>(
  route: RouteHandler<LOut>,
  options: { layer: Layer.Layer<LOut, unknown, never> },
) {
  return (req: NextRequest) => route[RouteOverride](req, options.layer);
}

export function successToHttpResult<A>(value: A): HttpResult<A> {
  if (
    HttpResult.$is("Ok")(value) ||
    HttpResult.$is("Error")(value) ||
    HttpResult.$is("NoContent")(value)
  ) {
    return value as HttpResult<A>;
  }

  return HttpResult.Ok({ body: value });
}

export function failureToHttpResult(error: unknown) {
  if (HttpResult.$is("Error")(error)) {
    return error;
  }

  return HttpResult.Error({
    status: 500,
    message: "Internal Server Error",
    cause: error,
  });
}
