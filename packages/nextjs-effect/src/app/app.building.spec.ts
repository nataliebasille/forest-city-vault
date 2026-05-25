import { describe, test } from "node:test";
import { Context, Effect, Layer } from "effect";
import { make } from "./app";

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type HasRoute<T> = T extends { route: Function } ? true : false;

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

class CounterService extends Context.Tag("building/Counter")<
  CounterService,
  { value: number }
>() {}

class FailingService extends Context.Tag("building/Failing")<
  FailingService,
  { x: number }
>() {}

// ---------------------------------------------------------------------------
// Typing tests
// ---------------------------------------------------------------------------

describe("app building – types", () => {
  test("make(Layer.empty) has route at the type level", () => {
    const app = make(Layer.empty);
    type _HasRoute = Expect<HasRoute<typeof app>>;
  });

  test("use(failingLayer) removes route from the type", () => {
    const failingLayer = Layer.fail(new Error("oops")) as Layer.Layer<
      FailingService,
      Error,
      never
    >;
    const app = make(Layer.empty).use(failingLayer);
    type _NoRoute = Expect<HasRoute<typeof app> extends false ? true : never>;
  });

  test("use(successLayer) keeps route at the type level", () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 42 }),
    );
    type _HasRoute = Expect<HasRoute<typeof app>>;
  });

  test("middleware keeps route at the type level", () => {
    const app = make(Layer.empty).use(
      (next: Effect.Effect<unknown, never>) => next,
    );
    type _HasRoute = Expect<HasRoute<typeof app>>;
  });

  test("yield* Dep infers the service type from the tag", () => {
    const effect = Effect.gen(function* () {
      const counter = yield* CounterService;
      return counter.value;
    });

    type _Context = Expect<
      Effect.Effect.Context<typeof effect> extends CounterService ? true : never
    >;
    type _Success = Expect<
      Effect.Effect.Success<typeof effect> extends number ? true : never
    >;
  });

  test("yield* Dep in middleware correctly requires the service", () => {
    const middleware = (next: Effect.Effect<unknown, never, CounterService>) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const result = yield* next;
        return { result, value: counter.value };
      });

    type _Context = Expect<
      Effect.Effect.Context<ReturnType<typeof middleware>> extends CounterService
        ? true
        : never
    >;
  });
});
