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
  test("handler requiring a service provided by provide(layer) compiles", () => {
    const app = App.provide(Layer.succeed(CounterService, { value: 42 }));
    app.run(CounterService.pipe(Effect.map((c) => c.value)));
  });

  test("handler requiring an unprovided service is a type error", () => {
    // @ts-expect-error - CounterService has not been installed via provide()
    App.run(CounterService.pipe(Effect.map((c) => c.value)));
  });

  test("services from two separate provide(layer) calls are both available to handlers", () => {
    const app = App.provide(
      Layer.succeed(CounterService, { value: 1 }),
    ).provide(Layer.succeed(LabelService, { text: "hello" }));

    app.run(
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

    App.provide(selfSufficient);
  });

  test("a layer with unmet deps passed directly to provide() is a type error", () => {
    const derivedLayer = Layer.effect(
      LabelService,
      CounterService.pipe(Effect.map((c) => ({ text: `count:${c.value}` }))),
    );

    // @ts-expect-error - derivedLayer requires CounterService which is not yet installed
    App.provide(derivedLayer);
  });
});
