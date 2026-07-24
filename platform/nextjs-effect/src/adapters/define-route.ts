import { Effect, Layer } from "effect";
import { NextRequest } from "next/server";
import { HttpResult, httpResultToResponse } from "../http/http-result";
import { MustBeNever } from "../types.internal";
import { toSafeErrorDetails } from "./error-details.internal";
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
 * Creates a route factory bound to a dependency `layer` (and optional
 * `middleware`). The returned function wraps a handler into a Next.js route.
 *
 * `defineRoute` is deliberately policy-free: for each request it creates the
 * request Effect, provides the configured `layer`, applies the configured
 * `middleware`, provides the request-state services, then performs logging and
 * HTTP result conversion before running the Effect. It knows nothing about
 * sagas, transactions or pools — those are application concerns. An application
 * that wants request-wide saga semantics composes `withSaga` (or any other
 * behavior) into `middleware`; see Clover's `route`/`pooledRoute` helpers.
 *
 * `middleware` is an ordinary Effect-to-Effect transformation applied *around*
 * the layer-provided handler, so it may add or remove requirements. In
 * particular a middleware may satisfy a requirement that the configured `layer`
 * introduces (for example a saga-scoped layer that requires a `Saga` service
 * supplied by a `withSaga` middleware) without `defineRoute` knowing what that
 * requirement represents — the generic `LReq` on the `layer` is free.
 *
 * The `layer` is kept as a distinct, replaceable input so tests can swap it via
 * {@link testRoute} without the production layer ever being constructed.
 */
export function defineRoute<LOut, LErr>(config: {
  layer: Layer.Layer<LOut, LErr, never>;
}): <A, E, R>(
  action: (
    req: NextRequest,
  ) => Effect.Effect<A, E, R> &
    MustBeNever<Exclude<R, LOut | RequestStateDeps>>,
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
    MustBeNever<Exclude<ROut, LOut | RequestStateDeps>>,
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
    ) => {
      const requestStartedAt = Date.now();
      const requestContext = {
        httpMethod: req.method,
        routePath: req.nextUrl.pathname,
      };

      return Effect.runPromise(
        action(req).pipe(
          Effect.provide(layer),
          middleware,
          Effect.provide(buildRequestStateLayer("route", req)),
          Effect.tapBoth({
            onFailure: (error) => {
              const result = failureToHttpResult(error);
              const durationMs = Date.now() - requestStartedAt;
              const log =
                result.status >= 500 ? Effect.logError : Effect.logWarning;

              return log("route.request.failed", {
                ...requestContext,
                status: result.status,
                durationMs,
                failureDisposition:
                  result.status >= 500 ?
                    "unexpected_defect"
                  : "expected_terminal",
                error: toSafeErrorDetails(result.cause ?? error),
              });
            },
            onSuccess: (value) => {
              const result = successToHttpResult(value);
              const durationMs = Date.now() - requestStartedAt;

              return Effect.logInfo("route.request.completed", {
                ...requestContext,
                status: getHttpStatus(result),
                durationMs,
              });
            },
          }),
          Effect.match({
            onFailure: (error) =>
              httpResultToResponse(failureToHttpResult(error)),

            onSuccess: (value) =>
              httpResultToResponse(successToHttpResult(value)),
          }),
        ) as unknown as Effect.Effect<Response, never, never>,
      );
    };

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
    HttpResult.$is("Redirect")(value) ||
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

function getHttpStatus(result: HttpResult<unknown>) {
  if (HttpResult.$is("NoContent")(result)) {
    return 204;
  }

  if (HttpResult.$is("Redirect")(result)) {
    return result.status;
  }

  if (HttpResult.$is("Error")(result)) {
    return result.status;
  }

  return 200;
}
