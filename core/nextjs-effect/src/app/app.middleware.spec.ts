import { Context, Effect, Layer } from "effect";
import { expect } from "expect";
import { describe, test } from "node:test";
import { App, defineMiddleware } from "./app";
import { Headers } from "../adapters/request/headers";
import { NextRequest } from "next/server";
import { expectTypeOf } from "expect-type";

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

class CounterService extends Context.Tag("middleware/Counter")<
  CounterService,
  { value: number }
>() {}

const mockRequest = (url = "http://localhost/test") => new NextRequest(url);

// ---------------------------------------------------------------------------
// App.use(provider) - type tests
// ---------------------------------------------------------------------------

describe("App.provide(provider) - types", () => {
  test("a self-contained layer compiles when passed to provide()", () => {
    App.provide(Layer.succeed(CounterService, { value: 1 }));
  });

  test("two layers from separate provide() calls are both accepted", () => {
    class LabelService extends Context.Tag("middleware-provider/Label")<
      LabelService,
      { text: string }
    >() {}

    const app = App.provide(
      Layer.succeed(CounterService, { value: 1 }),
    ).provide(Layer.succeed(LabelService, { text: "hello" }));

    type Expected = CounterService | LabelService;
    type Actual = App.Services<typeof app>;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });

  test("a derived layer can be added after its dependency layer is provided", () => {
    class LabelService extends Context.Tag("middleware-provider/DerivedLabel")<
      LabelService,
      { text: string }
    >() {}

    const derivedLayer = Layer.effect(
      LabelService,
      CounterService.pipe(Effect.map((c) => ({ text: `count:${c.value}` }))),
    );

    App.provide(Layer.succeed(CounterService, { value: 1 })).provide(
      derivedLayer,
    );
  });

  test("a layer with unmet requirements cannot be used before those requirements are provided", () => {
    class LabelService extends Context.Tag("middleware-provider/UnmetLabel")<
      LabelService,
      { text: string }
    >() {}

    const derivedLayer = Layer.effect(
      LabelService,
      CounterService.pipe(Effect.map((c) => ({ text: `count:${c.value}` }))),
    );

    // @ts-expect-error - derivedLayer requires CounterService which is not yet installed
    App.provide(derivedLayer);
  });
});

// ---------------------------------------------------------------------------
// App.use(middleware) - type tests
// ---------------------------------------------------------------------------

describe("App.use(middleware) - types", () => {
  test("middleware requiring an unprovided service is a type error", () => {
    // @ts-expect-error - CounterService has not been provided to the app
    App.use((next) =>
      Effect.gen(function* () {
        yield* CounterService;
        return yield* next;
      }),
    );
  });

  test("middleware requiring a service provided by a layer compiles", () => {
    App.provide(Layer.succeed(CounterService, { value: 1 })).use(
      defineMiddleware((next) =>
        Effect.gen(function* () {
          yield* CounterService;
          return yield* next;
        }),
      ),
    );
  });

  test("service provided by one middleware is available to a subsequent middleware", () => {
    const provider = Effect.provide(
      Layer.succeed(CounterService, { value: 1 }),
    );

    const consumer = defineMiddleware((next) =>
      Effect.gen(function* () {
        yield* CounterService;
        return yield* next;
      }),
    );

    App.provide(Layer.succeed(CounterService, { value: 1 })).use(consumer);
  });

  test("transform middleware constrains the handler output type", () => {
    const mw = defineMiddleware((next) =>
      next.pipe(Effect.map((s) => new Response(JSON.stringify(s)))),
    );

    const app = App.use(mw);

    // @ts-expect-error - handler must return string for the middleware to consume
    app.route(() => Effect.succeed(42));
  });

  test("handler returning the correct type for a transform middleware compiles", () => {
    const mw = defineMiddleware((next) =>
      next.pipe(Effect.map((s) => new Response(JSON.stringify(s)))),
    );

    const app = App.use(mw);

    app.run(Effect.succeed("hello"));
  });
});

// ---------------------------------------------------------------------------
// App.use(middleware) - runtime tests
// ---------------------------------------------------------------------------

describe("App.use(middleware) - runtime", () => {
  test("middleware added via use() runs when run is called", async () => {
    const order: string[] = [];
    const app = App.use(
      defineMiddleware((next) =>
        Effect.gen(function* () {
          order.push("middleware:in");
          const r = yield* next;
          order.push("middleware:out");
          return r;
        }),
      ),
    );

    await app.run(Effect.sync(() => order.push("handler")));

    expect(order).toEqual(["middleware:in", "handler", "middleware:out"]);
  });

  test("multiple use(middleware) calls compose outermost-last", async () => {
    const order: string[] = [];
    const m = (label: string) =>
      defineMiddleware(<A, E, R>(next: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          order.push(`${label}:in`);
          const r = yield* next;
          order.push(`${label}:out`);
          return r;
        }),
      );

    const app = App.use(m("A")).use(m("B"));
    await app.run(Effect.sync(() => order.push("handler")));

    expect(order).toEqual(["B:in", "A:in", "handler", "A:out", "B:out"]);
  });

  test("middleware can access a service provided by a layer", async () => {
    const collected: number[] = [];

    const mw = defineMiddleware((next) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        collected.push(counter.value);
        return yield* next;
      }),
    );

    const app = App.provide(Layer.succeed(CounterService, { value: 42 })).use(
      mw,
    );

    await app.run(Effect.succeed("done"));

    expect(collected).toEqual([42]);
  });
});
