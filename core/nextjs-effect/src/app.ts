import { Cause, Effect, Layer, Option } from "effect";
import { NextRequest } from "next/server";
import { HttpFailure, isHttpFailure, NoContent } from "./public";
import { ReactNode } from "react";
import { buildRequestStateLayer, RequestStateDeps } from "./request/layer";

type GlobalAppDeps = RequestStateDeps;

type MissingDeps<Have, Need> = Exclude<Need, Have>;

/**
 * Produces a readable type-level error when a value requires dependencies
 * that are not currently available.
 *
 * This is meant to be intersected with a function/layer argument.
 */
type MissingDepsError<Have, Need, Message extends string> = [
  MissingDeps<Have, Need>,
] extends [never]
  ? unknown
  : {
      readonly __error__: Message;
      readonly __missing_dependencies__: MissingDeps<Have, Need>;
      readonly __available_dependencies__: Have;
    };

/**
 * Type-level error for layer providers.
 *
 * A layer can only be added if the app already has the services required
 * to build that layer.
 */
type LayerDepsError<DepsAvailableToProvider, DepsUsedByProvider> =
  MissingDepsError<
    DepsAvailableToProvider,
    DepsUsedByProvider,
    "This provider requires dependencies that the App does not have yet"
  >;

/**
 * Type-level error for handlers or middleware.
 */
export type HandlerDepsError<DepsAvailableToHandler, DepsUsedByHandler> =
  MissingDepsError<
    DepsAvailableToHandler,
    DepsUsedByHandler,
    "This handler requires dependencies that are not available"
  >;

/**
 * Internal sentinel used when no transforming middleware has been installed.
 */
declare const NoTransformSymbol: unique symbol;

/**
 * Internal sentinel type used to represent an identity middleware stack.
 */
type NoTransform = typeof NoTransformSymbol;

/**
 * Computes the final output after the middleware stack.
 *
 * If there is no transforming middleware, the final output is the handler's
 * own output.
 */
type FinalOutput<StackOut, HandlerOut> = [StackOut] extends [NoTransform]
  ? HandlerOut
  : StackOut;

/**
 * Ensures a handler returns the type currently required by the middleware stack.
 *
 * If no transforming middleware exists, the handler may return whatever the
 * adapter requires.
 */
export type HandlerOutputError<StackIn, HandlerOut> = [StackIn] extends [
  NoTransform,
]
  ? unknown
  : [HandlerOut] extends [StackIn]
    ? unknown
    : {
        readonly __error__: "This handler does not return the output type required by the middleware stack";
        readonly __required_handler_output__: StackIn;
        readonly __actual_handler_output__: HandlerOut;
      };

/**
 * Ensures the final output of the handler plus middleware stack matches what
 * the adapter needs.
 *
 * Routes must eventually produce `Response`.
 * Pages must eventually produce `ReactNode`.
 */
export type FinalOutputError<ExpectedOut, StackOut, HandlerOut> = [
  FinalOutput<StackOut, HandlerOut>,
] extends [ExpectedOut]
  ? unknown
  : {
      readonly __error__: "The final middleware output does not match the adapter output";
      readonly __expected_output__: ExpectedOut;
      readonly __actual_output__: FinalOutput<StackOut, HandlerOut>;
    };

/**
 * Ensures a newly added transforming middleware can feed the existing
 * middleware stack.
 *
 * Middleware is appended as the new innermost middleware.
 */
export type MiddlewareOutputError<StackIn, MiddlewareOut> = [StackIn] extends [
  NoTransform,
]
  ? unknown
  : [MiddlewareOut] extends [StackIn]
    ? unknown
    : {
        readonly __error__: "This middleware output does not satisfy the existing middleware stack input";
        readonly __required_output__: StackIn;
        readonly __actual_output__: MiddlewareOut;
      };

/**
 * Computes the final stack output after adding a transforming middleware.
 *
 * If this is the first transform, its output becomes the final output.
 * Otherwise, the existing outer stack output remains final.
 */
export type NextStackOut<StackOut, MiddlewareOut> = [StackOut] extends [
  NoTransform,
]
  ? MiddlewareOut
  : StackOut;

/**
 * Output-preserving middleware.
 *
 * Shape:
 *
 * ```ts
 * (next: Effect) => Effect
 * ```
 */
export type EffectMiddleware<
  Provides = never,
  Needs = never,
  MiddlewareFailure = never,
> = <A, E, R>(
  next: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E | MiddlewareFailure, Needs | Exclude<R, Provides>>;

/**
 * Output-transforming middleware.
 *
 * `next` returns `NextOut`.
 * The middleware returns `Out`.
 */
export type EffectTransformMiddleware<
  NextOut,
  Out,
  Provides = never,
  Needs = never,
  MiddlewareFailure = never,
> = <E, R>(
  next: Effect.Effect<NextOut, E, R>,
) => Effect.Effect<Out, E | MiddlewareFailure, Needs | Exclude<R, Provides>>;

export type RouteEffect<Out, Error, Deps> = (
  request: NextRequest,
) => Effect.Effect<Out, Error, Deps>;

export type PageEffect<Props, Out, Error, Deps> = (
  props: Props,
) => Effect.Effect<Out, Error, Deps>;

/**
 * App builder.
 *
 * @template AppDeps Global deps installed by `use(layer)`.
 * @template MiddlewareProvides Deps provided to inner handlers by middleware.
 * @template StackIn Output type the handler must produce for the middleware stack.
 * @template StackOut Final output type produced by the middleware stack.
 */
export type App<
  AppDeps,
  MiddlewareProvides = never,
  StackIn = NoTransform,
  StackOut = NoTransform,
> = {
  use: {
    <Adds, Needs = never, LayerError = never>(
      layer: Layer.Layer<Adds, LayerError, NoInfer<Needs>> &
        LayerDepsError<AppDeps, NoInfer<Needs>>,
    ): App<AppDeps | Adds, MiddlewareProvides, StackIn, StackOut>;

    <Provides = never, Needs = never, MiddlewareFailure = never>(
      middleware: EffectMiddleware<
        Provides,
        NoInfer<Needs>,
        MiddlewareFailure
      > &
        HandlerDepsError<
          AppDeps | GlobalAppDeps | MiddlewareProvides,
          NoInfer<Needs>
        >,
    ): App<AppDeps, MiddlewareProvides | Provides, StackIn, StackOut>;

    <NextOut, Out, Provides = never, Needs = never, MiddlewareFailure = never>(
      middleware: EffectTransformMiddleware<
        NextOut,
        Out,
        Provides,
        NoInfer<Needs>,
        MiddlewareFailure
      > &
        HandlerDepsError<
          AppDeps | GlobalAppDeps | MiddlewareProvides,
          NoInfer<Needs>
        > &
        MiddlewareOutputError<StackIn, NoInfer<Out>>,
    ): App<
      AppDeps,
      MiddlewareProvides | Provides,
      NextOut,
      NextStackOut<StackOut, Out>
    >;
  };

  route: <Out, Error, Deps>(
    handler: RouteEffect<Out, Error, Deps> &
      HandlerDepsError<
        AppDeps | GlobalAppDeps | MiddlewareProvides,
        NoInfer<Deps>
      > &
      HandlerOutputError<StackIn, Out>,
  ) => (request: NextRequest) => Promise<Response>;

  page: <Props, Out, Error, Deps>(
    handler: PageEffect<Props, Out, Error, Deps> &
      HandlerDepsError<
        AppDeps | GlobalAppDeps | MiddlewareProvides,
        NoInfer<Deps>
      > &
      HandlerOutputError<StackIn, Out>,
  ) => (props: Props) => Promise<ReactNode>;
};

type AnyEffect = Effect.Effect<any, HttpFailure, any>;

type AnyMiddleware = (next: AnyEffect) => AnyEffect;

/**
 * Middleware order:
 *
 * ```ts
 * App.use(a).use(b).route(handler)
 * ```
 *
 * runs as:
 *
 * ```ts
 * a(b(handlerEffect))
 * ```
 */
const applyMiddlewares = (
  effect: AnyEffect,
  middlewares: ReadonlyArray<AnyMiddleware>,
): AnyEffect =>
  middlewares.reduceRight((next, middleware) => middleware(next), effect);

const runProvided = <A>(
  effect: Effect.Effect<A, HttpFailure, any>,
  scopeLayer: Layer.Layer<any, HttpFailure, never>,
  appLayer: Layer.Layer<any, HttpFailure, never>,
): Promise<A> => {
  const provided = effect.pipe(
    Effect.provide(scopeLayer),
    Effect.provide(appLayer),
  ) as Effect.Effect<A, HttpFailure, never>;

  return Effect.runPromise(provided);
};

/**
 * Creates an app.
 *
 * @template AppDeps Initial app dependencies.
 *
 * @param appLayer Initial app layer. Usually `Layer.empty`.
 * @param middlewares Internal middleware stack.
 */
const makeApp = <AppDeps = never>(
  appLayer: Layer.Layer<AppDeps, HttpFailure, never>,
  middlewares: ReadonlyArray<AnyMiddleware> = [],
): App<AppDeps> => {
  const app: App<AppDeps> = {
    use: ((value: unknown) => {
      if (typeof value === "function") {
        return makeApp(appLayer, [...middlewares, value as AnyMiddleware]);
      }

      const layer = value as Layer.Layer<any, HttpFailure, any>;

      const nextLayer = appLayer.pipe(Layer.provideMerge(layer)) as Layer.Layer<
        any,
        HttpFailure,
        never
      >;

      return makeApp(nextLayer, middlewares);
    }) as App<AppDeps>["use"],

    route: ((handler: RouteEffect<any, any, any>) =>
      async (request: NextRequest) => {
        const scopeLayer = buildRequestStateLayer("route", request);

        const effect = applyMiddlewares(handler(request), middlewares).pipe(
          Effect.matchCause({
            onSuccess: toSuccessResponse,
            onFailure: toFailureResponse,
          }),
        );

        return runProvided(effect, scopeLayer, appLayer);
      }) as App<AppDeps>["route"],

    page: ((handler: PageEffect<unknown, any, any, any>) =>
      async (props: unknown) => {
        const scopeLayer = buildRequestStateLayer("page");

        const effect = applyMiddlewares(handler(props), middlewares);

        return runProvided(effect, scopeLayer, appLayer);
      }) as App<AppDeps>["page"],
  };

  return app;
};

/**
 * Empty app with no installed dependencies.
 */
export const App = makeApp(Layer.empty);

function toSuccessResponse(value: unknown): Response {
  if (value instanceof Response) {
    return value;
  }

  if (value === undefined || value === null || value instanceof NoContent) {
    return new Response(null, { status: 204 });
  }

  if (typeof value === "string") {
    return new Response(value, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  return Response.json(value);
}

function toFailureResponse(cause: Cause.Cause<HttpFailure>): Response {
  const failure = Option.getOrUndefined(Cause.failureOption(cause));

  if (isHttpFailure(failure)) {
    return Response.json(
      {
        error: failure.message,
      },
      {
        status: failure.status,
      },
    );
  }

  return Response.json(
    {
      error: "Internal Server Error",
    },
    {
      status: 500,
    },
  );
}
