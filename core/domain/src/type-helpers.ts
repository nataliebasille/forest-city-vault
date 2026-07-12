import { Effect, Schema } from "effect";

export type AnyStruct = Schema.Struct<any>;
export type IsNever<T> = [T] extends [never] ? true : false;
export type EffectError<T> =
  T extends Effect.Effect<any, infer E, any> ? E : never;
export type EffectContext<T> =
  T extends Effect.Effect<any, any, infer R> ? R : never;
export type HandlerReturn<T> =
  T extends (...args: any[]) => infer Ret ? Ret : never;
