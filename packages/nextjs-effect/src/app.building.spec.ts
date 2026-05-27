import { describe, test } from "node:test";
import { expectTypeOf } from "expect-type";
import { Context, Effect, Layer } from "effect";
import { make } from "./app";

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
    expectTypeOf<typeof app>().toExtend<{ route: Function }>();
  });

  test("use(failingLayer) removes route from the type", () => {
    const failingLayer = Layer.fail(new Error("oops")) as Layer.Layer<
      FailingService,
      Error,
      never
    >;
    const app = make(Layer.empty).use(failingLayer);
    expectTypeOf<typeof app>().not.toExtend<{ route: Function }>();
  });

  test("use(successLayer) keeps route at the type level", () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 42 }),
    );
    expectTypeOf<typeof app>().toExtend<{ route: Function }>();
  });

  test("middleware keeps route at the type level", () => {
    const app = make(Layer.empty).use(
      (next: Effect.Effect<unknown, never>) => next,
    );
    expectTypeOf<typeof app>().toExtend<{ route: Function }>();
  });

  test("yield* Dep infers the service type from the tag", () => {
    const effect = Effect.gen(function* () {
      const counter = yield* CounterService;
      return counter.value;
    });

    expectTypeOf<Effect.Effect.Context<typeof effect>>().toExtend<CounterService>();
    expectTypeOf<Effect.Effect.Success<typeof effect>>().toExtend<number>();
  });

  test("yield* Dep in middleware correctly requires the service", () => {
    const middleware = (next: Effect.Effect<unknown, never, CounterService>) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const result = yield* next;
        return { result, value: counter.value };
      });

    expectTypeOf<Effect.Effect.Context<ReturnType<typeof middleware>>>().toExtend<CounterService>();
  });
});
