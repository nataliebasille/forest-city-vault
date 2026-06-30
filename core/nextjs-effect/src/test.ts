import { Effect, Either, Layer } from "effect";
import { compose, pipe } from "effect/Function";
import { isLayer } from "effect/Layer";
import { Substitute } from "./app/app.internal";
import { NextRequest } from "next/server";

class CounterService extends Effect.Tag("Counter")<
  CounterService,
  { value: number }
>() {}

const CounterLive = Layer.succeed(CounterService, { value: 1 });

class LabelService extends Effect.Tag("Label")<
  LabelService,
  { text: string }
>() {}

const LabelLive = Layer.succeed(LabelService, { text: "hello" });

declare const AIn: unique symbol;
declare const EIn: unique symbol;
declare const RIn: unique symbol;
declare const AOut: unique symbol;
declare const EOut: unique symbol;
declare const ROut: unique symbol;

export interface EffectTransform {
  readonly [AIn]: unknown;
  readonly [EIn]: unknown;
  readonly [RIn]: unknown;

  readonly [AOut]: unknown;
  readonly [EOut]: unknown;
  readonly [ROut]: unknown;
}

type WithInput<F, A, E, R> = F & {
  readonly [AIn]: A;
  readonly [EIn]: E;
  readonly [RIn]: R;
};

export type ApplyA<F extends EffectTransform, A, E, R> = WithInput<
  F,
  A,
  E,
  R
>[typeof AOut];

export type ApplyE<F extends EffectTransform, A, E, R> = WithInput<
  F,
  A,
  E,
  R
>[typeof EOut];

export type ApplyR<F extends EffectTransform, A, E, R> = WithInput<
  F,
  A,
  E,
  R
>[typeof ROut];

export type ApplyEffect<F extends EffectTransform, A, E, R> = Effect.Effect<
  ApplyA<F, A, E, R>,
  ApplyE<F, A, E, R>,
  ApplyR<F, A, E, R>
>;

export interface InferredTransform<
  AExpr,
  EExpr,
  RExpr,
> extends EffectTransform {
  readonly [AOut]: Substitute<
    AExpr,
    this[typeof AIn],
    this[typeof EIn],
    this[typeof RIn]
  >;

  readonly [EOut]: Substitute<
    EExpr,
    this[typeof AIn],
    this[typeof EIn],
    this[typeof RIn]
  >;

  readonly [ROut]: Substitute<
    RExpr,
    this[typeof AIn],
    this[typeof EIn],
    this[typeof RIn]
  >;
}

type EnsureRunnable<
  A,
  B,
  C,
  D,
  E,
  F,
  M extends (self: Effect.Effect<A, B, C>) => Effect.Effect<D, E, F>,
> = [Effect.Effect.Context<ReturnType<M>>] extends [never]
  ? Effect.Effect<A, B, C>
  : never;

function inferTransform<A, B, C, D, E, F>(
  transform: (self: Effect.Effect<A, B, C>) => Effect.Effect<D, E, F>,
): InferredTransform<D, E, F> {
  return transform as unknown as InferredTransform<D, E, F>;
}

export function higher<A, B, C, D, E, F>(
  transform: (self: Effect.Effect<A, B, C>) => Effect.Effect<D, E, F>,
) {
  type Inferred = InferredTransform<D, E, F>;

  return {
    run: (program: Effect.Effect<A, B, C>) => {
      return null as unknown as ApplyEffect<Inferred, A, B, C>;
    },
  };
}

export function higher2<A, B, C, D, E, F>(
  transform: (self: Effect.Effect<A, B, C>) => Effect.Effect<D, E, F>,
) {
  type Inferred = InferredTransform<D, E, F>;

  function run(program: Effect.Effect<A, B, C>) {
    return transform(program) as unknown as ApplyEffect<Inferred, A, B, C>;
  }

  const andThen = <G, H, I>(
    nextTransform: (self: Effect.Effect<D, E, F>) => Effect.Effect<G, H, I>,
  ) => {
    return higher2(compose(transform, nextTransform));
  };

  (run as any).andThen = andThen;

  return run as ((
    program: Effect.Effect<A, B, C>,
  ) => ApplyEffect<Inferred, A, B, C>) & { andThen: typeof andThen };
  /// return (program: Effect.Effect<A, B, C>) => transform(program);
  // return {
}

const x1 = higher(Effect.provide(CounterLive)).run(Effect.succeed(5 as const));

const wrong = higher2(Effect.provide(CounterLive))(Effect.succeed(5 as const));

const okay = higher2(Effect.provide(CounterLive))(
  Effect.gen(function* () {
    return yield* CounterService;
  }),
);
//.andThen(() => Effect.succeed(5 as const))
// // .run(
// //   Effect.gen(function* () {
// //     return yield* CounterService;
// //   }),
// // );

function test<
  M1 extends (
    self: Effect.Effect<unknown, unknown, unknown>,
  ) => Effect.Effect<unknown, unknown, unknown>,
  M2 extends (
    self: Effect.Effect<any, any, any>,
  ) => Effect.Effect<any, any, any>,
>(m1: M1, m2: M2) {
  return <A, E, R>(program: Effect.Effect<A, E, R>) => {
    return program.pipe(m1);
  };
}

const x = test(
  Effect.provide(CounterLive),
  Effect.provide(LabelLive),
)(
  Effect.gen(function* () {
    const counter = yield* CounterService;
    return counter.value;
  }),
);

const y = compose(Effect.provide(CounterLive), Effect.provide(LabelLive));

interface RouteEffectKind {
  readonly _AIn: unknown;
  readonly _EIn: unknown;
  readonly _RIn: unknown;
  readonly _AOut: unknown;
  readonly _EOut: unknown;
  readonly _ROut: unknown;
}

interface IdentityRouteEffect extends RouteEffectKind {
  readonly _AOut: this["_AIn"];
  readonly _EOut: this["_EIn"];
  readonly _ROut: this["_RIn"];
}

type ApplyRouteEffect<F extends RouteEffectKind, A, E, R> = F & {
  readonly _AIn: A;
  readonly _EIn: E;
  readonly _RIn: R;
};

type RouteA<F extends RouteEffectKind, A, E, R> = ApplyRouteEffect<
  F,
  A,
  E,
  R
>["_AOut"];

type RouteE<F extends RouteEffectKind, A, E, R> = ApplyRouteEffect<
  F,
  A,
  E,
  R
>["_EOut"];

type RouteR<F extends RouteEffectKind, A, E, R> = ApplyRouteEffect<
  F,
  A,
  E,
  R
>["_ROut"];

type MustBeNever<R> = [R] extends [never]
  ? unknown
  : {
      readonly ERROR: "Route handler has missing dependencies";
      readonly remaining: R;
    };

function defineRouteCreator2<AIn, EIn, RIn, AOut, EOut, ROut>(
  effect: (
    self: Effect.Effect<AIn, EIn, RIn>,
  ) => Effect.Effect<AOut, EOut, ROut>,
) {
  return <R extends RIn>(
    action: ((req: NextRequest) => Effect.Effect<AIn, EIn, R>) & {
      readonly _AIn: AIn;
      readonly _EIn: EIn;
      readonly _RIn: RIn;
      readonly _AOut: AOut;
      readonly _EOut: EOut;
      readonly _ROut: ROut;
    },
  ) => {
    return (req: NextRequest) => {
      return Effect.runPromise(
        (action(req) as any).pipe(effect, Effect.either) as any,
      );
    };
  };
}

// Effect.runPromise(
//   compose(
//     Effect.provide(CounterLive),
//     Effect.provide(LabelLive),
//   )(
//     Effect.gen(function* () {
//       const counter = yield* LabelService;
//       return counter.text;
//     }),
//   ),
// );

function defineRouteCreator<AIn, EIn, RIn, AOut, EOut, ROut>(
  effect: (
    self: Effect.Effect<AIn, EIn, RIn>,
  ) => Effect.Effect<AOut, EOut, ROut>,
) {
  const finalEffect = compose(effect, Effect.provide(CounterLive));
  return (
    action: (
      req: NextRequest,
    ) => Effect.Effect<AIn, EIn, RIn> &
      MustBeNever<Effect.Effect.Context<ReturnType<typeof finalEffect>>>,
  ) => {
    return (req: NextRequest) => {
      return Effect.runPromise(
        action(req).pipe(
          finalEffect,
          Effect.either,
        ) as unknown as Effect.Effect<Either.Either<EOut, AOut>>,
      );
    };
  };
}

const route = defineRouteCreator(
  compose(Effect.provide(CounterLive), Effect.provide(LabelLive)),
);

const r = route((req) =>
  Effect.gen(function* () {
    const counter = yield* LabelService;
    return counter.text;
  }),
);
