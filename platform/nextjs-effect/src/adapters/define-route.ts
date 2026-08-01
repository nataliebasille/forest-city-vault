import { Effect, Layer } from "effect";
import { NextRequest } from "next/server";
import { HttpResult, httpResultToResponse } from "../http/http-result";
import {
  applyResponseHeaders,
  emptyResponseHeaderSink,
  ResponseHeaders,
} from "../http/response-headers";
import { MustBeNever } from "../types.internal";
import { toSafeErrorDetails } from "./error-details.internal";
import { buildRequestStateLayer, RequestStateDeps } from "./request/layer";

/**
 * A layer-aware wrapper applied around a route handler. Because it runs *inside*
 * the configured layer, its requirement channel is bounded by that layer's
 * `LOut` plus the per-request services (`RequestStateDeps`, `ResponseHeaders`):
 * it may read (or provide) any service the layer supplies without `defineRoute`
 * naming it, and requiring a service the layer does *not* provide is a type
 * error. It typically leaves the success and error channels intact while
 * enriching the requirement channel — for example reading a request-trace
 * service, or composing `withSaga` to run the handler inside a request saga.
 */
type RouteMiddleware<LOut> = (
  self: Effect.Effect<
    unknown,
    unknown,
    LOut | RequestStateDeps | ResponseHeaders
  >,
) => Effect.Effect<unknown, unknown, LOut | RequestStateDeps | ResponseHeaders>;

/**
 * The internal, layer-erased view of a {@link RouteMiddleware}: the public
 * `config.middleware` is checked against the layer-aware type, but inside the
 * factory we erase `LOut` so the pipeline can apply it to the untyped handler.
 */
type UntypedMiddleware = (
  self: Effect.Effect<unknown, unknown, unknown>,
) => Effect.Effect<unknown, unknown, unknown>;

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
    layer: Layer.Layer<LOut, unknown, RequestStateDeps>,
  ) => Promise<Response>;
};

/**
 * Creates a route factory bound to a dependency `layer` (and optional
 * `middleware`). The returned function wraps a handler into a Next.js route.
 *
 * `defineRoute` is deliberately policy-free: for each request it creates the
 * request Effect, applies the configured `middleware` *around* the handler,
 * provides the configured `layer`, provides the request-state services, then
 * performs logging and HTTP result conversion before running the Effect. It
 * knows nothing about sagas, transactions or pools — those are application
 * concerns. An application that wants request-wide saga semantics composes
 * `withSaga` into `middleware` and declares its saga-scoped services via
 * `provideSagaScoped` on the `layer`; see Clover's `route`/`pooledRoute`
 * helpers.
 *
 * `middleware` is applied *inside* the layer (it wraps the handler before the
 * layer is provided), so — exactly like `definePage` and `defineServerAction` —
 * a middleware may require services the configured `layer` provides. This is the
 * page/action analog: where a page returns its rendered value, a route converts
 * the handler's value (or typed failure) into a `Response`.
 *
 * `defineRoute` is saga-agnostic: it opens no saga and provides no `Saga`
 * service. The `layer` may require request-state services (provided from
 * `next/headers`), and its residual requirement channel is discharged before the
 * handler runs.
 *
 * The `layer` is kept as a distinct, replaceable input so tests can swap it via
 * {@link testRoute} without the production layer ever being constructed.
 */
export function defineRoute<LOut, LErr>(config: {
  layer: Layer.Layer<LOut, LErr, RequestStateDeps>;
  middleware?: RouteMiddleware<NoInfer<LOut>>;
}): <A, E, R>(
  action: (
    req: NextRequest,
  ) => Effect.Effect<A, E, R> &
    MustBeNever<Exclude<R, LOut | RequestStateDeps | ResponseHeaders>>,
) => RouteHandler<LOut> {
  const middleware = (config.middleware ?? identityTransform) as UntypedMiddleware;

  return ((
    action: (req: NextRequest) => Effect.Effect<unknown, unknown, unknown>,
  ): RouteHandler<unknown> => {
    const run = (
      req: NextRequest,
      layer: Layer.Layer<unknown, unknown, RequestStateDeps>,
    ) => {
      const requestStartedAt = Date.now();
      const requestContext = {
        httpMethod: req.method,
        routePath: req.nextUrl.pathname,
      };

      // Per-request sink that handlers write to via `setResponseHeader` (e.g. a
      // Set-Cookie for OAuth state, or Cache-Control: no-store). Kept out of the
      // HttpResult so handlers don't thread a header map through every
      // `ok`/`redirect`/`badRequest` call — they just `yield* setResponseHeader`.
      const responseHeaders = emptyResponseHeaderSink();

      return Effect.runPromise(
        middleware(action(req)).pipe(
          Effect.provide(layer),
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
          // Drain the sink onto the finished Response: whatever the handler
          // queued (on success OR failure) is appended here, so a rejected
          // OAuth callback still clears its state cookie.
          Effect.map((response) =>
            applyResponseHeaders(response, responseHeaders),
          ),
          // Provide the sink. Like the `Effect.provide`s above, a pipe-provide
          // satisfies everything *upstream* of it, so every `setResponseHeader`
          // in the handler/middleware resolves this one per-request instance —
          // it reads last but wraps the whole pipeline.
          Effect.provideService(ResponseHeaders, responseHeaders),
        ) as unknown as Effect.Effect<Response, never, never>,
      );
    };

    const routeFn = ((req: NextRequest) =>
      run(
        req,
        config.layer as Layer.Layer<unknown, unknown, RequestStateDeps>,
      )) as RouteHandler<unknown>;

    (routeFn as { [RouteOverride]: typeof run })[RouteOverride] = run;

    return routeFn;
  }) as ReturnType<typeof defineRoute<LOut, LErr>>;
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
  options: { layer: Layer.Layer<LOut, unknown, RequestStateDeps> },
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
