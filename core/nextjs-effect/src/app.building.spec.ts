import { describe, test } from "node:test";
import { Context, Effect, Layer } from "effect";
import { App } from "./app";

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

class CounterService extends Context.Tag("building/Counter")<
  CounterService,
  { value: number }
>() {}

class LabelService extends Context.Tag("building/Label")<
  LabelService,
  { text: string }
>() {}

// ---------------------------------------------------------------------------
// Typing tests
// ---------------------------------------------------------------------------

describe("app building - types", () => {
  test("handler requiring a service provided by use(layer) compiles", () => {
    const app = App.use(Layer.succeed(CounterService, { value: 42 }));
    app.route(() => CounterService.pipe(Effect.map((c) => c.value)));
  });

  test("handler requiring an unprovided service is a type error", () => {
    // @ts-expect-error - CounterService has not been installed via use()
    App.route(() => CounterService.pipe(Effect.map((c) => c.value)));
  });

  test("services from two separate use(layer) calls are both available to handlers", () => {
    const app = App.use(Layer.succeed(CounterService, { value: 1 })).use(
      Layer.succeed(LabelService, { text: "hello" }),
    );

    app.route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const label = yield* LabelService;
        return `${label.text}:${counter.value}`;
      }),
    );
  });

  test("a dependent layer pre-composed into a self-sufficient layer can be added", () => {
    const derivedLayer = Layer.effect(
      LabelService,
      CounterService.pipe(Effect.map((c) => ({ text: `count:${c.value}` }))),
    );

    const selfSufficient = Layer.provide(
      derivedLayer,
      Layer.succeed(CounterService, { value: 7 }),
    );

    App.use(selfSufficient);
  });

  test("a layer with unmet deps passed directly to use() is a type error", () => {
    const derivedLayer = Layer.effect(
      LabelService,
      CounterService.pipe(Effect.map((c) => ({ text: `count:${c.value}` }))),
    );

    // @ts-expect-error - derivedLayer requires CounterService which is not yet installed
    App.use(derivedLayer);
  });
});
