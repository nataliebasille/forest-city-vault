import { Layer, ManagedRuntime, Effect, Context } from "effect";
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { createRuntime } from "./runtime/runtime";
import { buildRequestStateLayer, RequestStateDeps } from "./request/layer";
import { HttpFailure, NoContent } from "./http/http-failure";

type AnyEffect = Effect.Effect<any, any, any>;

type AnyMiddleware = (next: AnyEffect) => AnyEffect;

type MiddlewareHandler<In, InError, InServices, Out, OutError, OutServices> = (
  next: Effect.Effect<In, InError, InServices>,
) => Effect.Effect<Out, OutError, OutServices>;

export interface AppBase<Result, Errors, Services> {
  use<LayerService, LayerError>(
    provider: Layer.Layer<LayerService, LayerError, Services>,
  ): App<Result, Errors | LayerError, Services | LayerService>;

  use<NextServices, MiddlewareResult, MiddlewareError, MiddlewareServices>(
    handler: MiddlewareHandler<
      Result,
      Errors,
      NextServices,
      MiddlewareResult,
      MiddlewareError,
      MiddlewareServices
    >,
  ): App<MiddlewareResult, MiddlewareError, NextServices>;
}

export type App<Result, Errors, Services> = AppBase<Result, Errors, Services> &
  ([Errors] extends [never | HttpFailure]
    ? {
        route<RouteResult, RouteError>(
          handler: (
            request: NextRequest,
          ) => Effect.Effect<
            RouteResult,
            RouteError,
            Services | RequestStateDeps
          >,
        ): (request: NextRequest) => Promise<Response>;
      }
    : {});

type AppBuilderState<Services, Errors> = {
  layer: Layer.Layer<Services, Errors, never>;
  middlewares: readonly AnyMiddleware[];
};

export function make<Services, Errors>(
  layer: Layer.Layer<Services, Errors, never>,
): App<unknown, Errors, Services> {
  return appBuilder<unknown, Errors, Services>({
    layer,
    middlewares: [],
  });
}

function appBuilder<Result, Errors, Services>(
  state: AppBuilderState<Services, Errors>,
): App<Result, Errors, Services> {
  const app = {
    use(arg: unknown) {
      if (typeof arg === "function") {
        const middleware = arg as AnyMiddleware;

        return appBuilder({
          layer: state.layer,
          middlewares: [...state.middlewares, middleware],
        }) as never;
      }

      const provider = arg as Layer.Layer<any, any, any>;

      return appBuilder({
        layer: Layer.merge(state.layer, provider) as Layer.Layer<
          any,
          any,
          never
        >,
        middlewares: state.middlewares,
      }) as never;
    },

    route<R, E>(
      handler: (
        request: NextRequest,
      ) => Effect.Effect<R, E, Services | RequestStateDeps>,
    ) {
      const runtime = ManagedRuntime.make(state.layer);

      return (request: NextRequest) => {
        const base = handler(request).pipe(
          Effect.map((result) =>
            result instanceof NoContent
              ? new Response(null, { status: 204 })
              : Response.json(result),
          ),
        );

        const pipeline = state.middlewares
          .reduce((next, middleware) => middleware(next), base as AnyEffect)
          .pipe(
            Effect.provide(buildRequestStateLayer("route", request)),
            Effect.catchTag("HttpFailure", (error) =>
              Effect.succeed(
                Response.json(
                  {
                    error: error.message,
                  },
                  {
                    status: error.status,
                  },
                ),
              ),
            ),
          );

        return runtime.runPromise(pipeline);
      };
    },
  };

  return app as App<Result, Errors, Services>;
}
