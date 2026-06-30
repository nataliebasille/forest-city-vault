import { Effect } from "effect";

declare const NextAId: unique symbol;
declare const NextEId: unique symbol;
declare const NextRId: unique symbol;

type NextA = { readonly [NextAId]: "NextA" };
type NextE = { readonly [NextEId]: "NextE" };
type NextR = { readonly [NextRId]: "NextR" };

export type NextEffect = Effect.Effect<NextA, NextE, NextR>;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

type Atomic =
  | Primitive
  | Function
  | Date
  | RegExp
  | Error
  | Promise<unknown>
  | Response
  | Request
  | Headers
  | URL;

export type Substitute<T, A, E, R> = T extends NextA
  ? A
  : T extends NextE
    ? E
    : T extends NextR
      ? R
      : T extends Atomic
        ? T
        : T extends readonly unknown[]
          ? { readonly [K in keyof T]: Substitute<T[K], A, E, R> }
          : T extends object
            ? { [K in keyof T]: Substitute<T[K], A, E, R> }
            : T;

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

export interface IdentityTransform extends EffectTransform {
  readonly [AOut]: this[typeof AIn];
  readonly [EOut]: this[typeof EIn];
  readonly [ROut]: this[typeof RIn];
}

export interface Then<
  First extends EffectTransform,
  Second extends EffectTransform,
> extends EffectTransform {
  readonly [AOut]: ApplyA<
    Second,
    ApplyA<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>,
    ApplyE<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>,
    ApplyR<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>
  >;

  readonly [EOut]: ApplyE<
    Second,
    ApplyA<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>,
    ApplyE<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>,
    ApplyR<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>
  >;

  readonly [ROut]: ApplyR<
    Second,
    ApplyA<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>,
    ApplyE<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>,
    ApplyR<First, this[typeof AIn], this[typeof EIn], this[typeof RIn]>
  >;
}

declare const MiddlewareTransform: unique symbol;

export type Middleware<F extends EffectTransform> = (<A, E, R>(
  next: Effect.Effect<A, E, R>,
) => ApplyEffect<F, A, E, R>) & {
  readonly [MiddlewareTransform]: F;
};

export type TransformOf<M> = M extends {
  readonly [MiddlewareTransform]: infer F extends EffectTransform;
}
  ? F
  : never;

export type Missing<Have, Need> = Exclude<Need, Have>;

export type RequireServices<Have, Need> = [Missing<Have, Need>] extends [never]
  ? unknown
  : {
      readonly __error__: "Missing app services";
      readonly missing: Missing<Have, Need>;
    };
