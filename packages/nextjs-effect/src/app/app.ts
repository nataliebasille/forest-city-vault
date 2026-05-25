import { Layer, ManagedRuntime, Effect, Context } from "effect";
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { createRuntime } from "../runtime/runtime";
import { buildRequestStateLayer } from "../request/layer";

type MiddlewareHandler<
  MiddlewareIn,
  MiddlewareOut,
  MiddlewareError,
  AppServices,
  AppError,
> = (
  next: Effect.Effect<MiddlewareIn, AppError, AppServices>,
) => Effect.Effect<MiddlewareOut, MiddlewareError, AppServices>;

type AnyMiddleware<Services, Errors> = MiddlewareHandler<
  any,
  any,
  any,
  Services,
  Errors
>;

type App<Result, Errors, Services> = {
  use<LayerService, LayerError>(
    provider: Layer.Layer<LayerService, LayerError, Services>,
  ): App<Result, Errors | LayerError, Services | LayerService>;
  use<NextResult, MiddlewareResult, MiddlewareError>(
    handler: MiddlewareHandler<
      NextResult,
      MiddlewareResult,
      MiddlewareError,
      Services,
      Errors
    >,
  ): App<MiddlewareResult, Errors | MiddlewareError, Services>;
} & ([Errors] extends [never]
  ? {
      route<R>(
        handler: (request: NextRequest) => Effect.Effect<R, never, Services>,
      ): (request: NextRequest) => Promise<R>;
    }
  : {});

export function make<Services, Error = never>(
  appLayer: Layer.Layer<Services, Error>,
): App<never, Error, Services> {
  return appBuilder(createRuntime(appLayer), []);
}

function appBuilder<Result, RuntimeErrors, EffectErrors, Services>(
  runtime: ManagedRuntime.ManagedRuntime<Services, RuntimeErrors>,
  middlewares: ReadonlyArray<
    AnyMiddleware<Services, RuntimeErrors | EffectErrors>
  >,
): App<Result, RuntimeErrors | EffectErrors, Services> {
  return {
    use<O, E>(
      providerOrHandler:
        | Layer.Layer<O, E, Services>
        | MiddlewareHandler<any, O, E, Services, RuntimeErrors | EffectErrors>,
    ) {
      if (Layer.isLayer(providerOrHandler)) {
        return appBuilder(runtime, [
          ...middlewares,
          (next) =>
            next.pipe(
              Effect.provide(providerOrHandler as Layer.Layer<O, E, Services>),
            ),
        ]);
      }

      return appBuilder(runtime, [
        ...middlewares,
        providerOrHandler as AnyMiddleware<
          Services,
          RuntimeErrors | EffectErrors
        >,
      ]);
    },

    route<R>(
      handler: (request: NextRequest) => Effect.Effect<R, Error, Services>,
    ) {
      return (request: NextRequest) => {
        const base = handler(request).pipe(
          Effect.provide(buildRequestStateLayer("route", request)),
        );

        const pipeline = middlewares.reduce(
          (next, middleware) => middleware(next),
          base as Effect.Effect<any, RuntimeErrors | EffectErrors, Services>,
        );

        return runtime.runPromise(pipeline);
      };
    },
  };
}
