import { Effect, Layer } from "effect";
import { Either } from "effect/Either";
import {
  ApplyA,
  ApplyE,
  ApplyR,
  EffectTransform,
  IdentityTransform,
  Middleware,
  RequireServices,
  Then,
  TransformOf,
} from "./app.internal";

export type App<
  Services = never,
  AppError = never,
  Stack extends EffectTransform = IdentityTransform,
> = {
  provide<Adds, LayerError, LayerNeeds>(
    layer: Layer.Layer<Adds, LayerError, LayerNeeds> &
      RequireServices<Services, LayerNeeds>,
  ): App<Services | Adds, AppError | LayerError, Stack>;

  use<M extends Middleware<EffectTransform>>(
    middleware: M,
  ): App<Services, AppError, Then<TransformOf<M>, Stack>>;

  run<A, E, R>(
    program: Effect.Effect<A, E, R> &
      RequireServices<Services, ApplyR<Stack, A, E, R>>,
  ): Promise<Either<ApplyA<Stack, A, E, R>, ApplyE<Stack, A, E, R> | AppError>>;
};

export namespace App {
  export type Services<A extends App<any, any, any>> =
    A extends App<infer S, any, any> ? S : never;
}

export const App = makeApp(Effect.provide(Layer.empty));

type AnyEffect = Effect.Effect<any, any, any>;
type RuntimeEffect = (program: AnyEffect) => AnyEffect;
type RuntimeMiddleware = (program: AnyEffect) => AnyEffect;

const identityRuntimeEffect: RuntimeEffect = (program) => program;

const appendRuntimeEffect =
  (current: RuntimeEffect, next: RuntimeEffect): RuntimeEffect =>
  (program) =>
    current(next(program));

function makeApp<
  Services = never,
  AppError = never,
  Stack extends EffectTransform = IdentityTransform,
>(
  runtimeEffect: RuntimeEffect = identityRuntimeEffect,
): App<Services, AppError, Stack> {
  return {
    provide<Adds, LayerError, LayerNeeds>(
      nextLayer: Layer.Layer<Adds, LayerError, LayerNeeds> &
        RequireServices<Services, LayerNeeds>,
    ) {
      const provideRuntimeEffect: RuntimeEffect = (program) =>
        Effect.provide(
          program,
          nextLayer as Layer.Layer<Adds, LayerError, never>,
        );

      return makeApp<Services | Adds, AppError | LayerError, Stack>(
        appendRuntimeEffect(runtimeEffect, provideRuntimeEffect),
      );
    },

    use<M extends Middleware<EffectTransform>>(middleware: M) {
      const middlewareRuntimeEffect: RuntimeEffect =
        middleware as RuntimeMiddleware;

      return makeApp<Services, AppError, Then<TransformOf<M>, Stack>>(
        appendRuntimeEffect(runtimeEffect, middlewareRuntimeEffect),
      );
    },

    run<A, E, R>(
      program: Effect.Effect<A, E, R> &
        RequireServices<Services, ApplyR<Stack, A, E, R>>,
    ) {
      const effect = runtimeEffect(program) as Effect.Effect<any, any, never>;
      const either = Effect.either(effect);

      return Effect.runPromise(either) as Promise<
        Either<ApplyA<Stack, A, E, R>, ApplyE<Stack, A, E, R> | AppError>
      >;
    },
  };
}
