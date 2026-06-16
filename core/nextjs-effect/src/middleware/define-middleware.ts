import { Effect } from "effect";

type AnyEffect = Effect.Effect<unknown, unknown, unknown>;

export function defineMiddleware() {
  return <
    const Middleware extends <A, E, R>(
      next: Effect.Effect<A, E, R>,
    ) => AnyEffect,
  >(
    middleware: Middleware,
  ) => middleware;
}
