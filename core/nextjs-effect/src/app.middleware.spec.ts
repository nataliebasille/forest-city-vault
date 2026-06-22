import { describe, test } from "node:test";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { Context, Effect, Layer } from "effect";
import { App, EffectMiddleware, EffectTransformMiddleware } from "./app";
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { Headers } from "./request/headers";
import { HttpFailure } from "./http/http-failure";

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

class CounterService extends Context.Tag("middleware/Counter")<
  CounterService,
  { value: number }
>() {}

const mockRequest = (url = "http://localhost/test") => new NextRequest(url);

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
    const mw: EffectMiddleware<never, CounterService> = (next) =>
      Effect.gen(function* () {
        yield* CounterService;
        return yield* next;
      });

    App.use(Layer.succeed(CounterService, { value: 1 })).use(mw);
  });

  test("service provided by one middleware is available to a subsequent middleware", () => {
    const provider: EffectMiddleware<CounterService, never> = (next) =>
      Effect.provide(next, Layer.succeed(CounterService, { value: 1 }));

    const consumer: EffectMiddleware<never, CounterService> = (next) =>
      Effect.gen(function* () {
        yield* CounterService;
        return yield* next;
      });

    App.use(provider).use(consumer);
  });

  test("transform middleware constrains the handler output type", () => {
    const mw: EffectTransformMiddleware<string, Response> = (next) =>
      next.pipe(Effect.map((s) => new Response(s)));

    const app = App.use(mw);

    // @ts-expect-error - handler must return string for the middleware to consume
    app.route(() => Effect.succeed(42));
  });

  test("handler returning the correct type for a transform middleware compiles", () => {
    const mw: EffectTransformMiddleware<string, Response> = (next) =>
      next.pipe(Effect.map((s) => new Response(s)));

    const app = App.use(mw);

    app.route(() => Effect.succeed("hello"));
  });
});

// ---------------------------------------------------------------------------
// App.use(middleware) - runtime tests
// ---------------------------------------------------------------------------

describe("App.use(middleware) - runtime", () => {
  test("middleware added via use() runs when route is called", async () => {
    const order: string[] = [];
    const app = App.use((next) =>
      Effect.gen(function* () {
        order.push("middleware:in");
        const r = yield* next;
        order.push("middleware:out");
        return r;
      }),
    );

    await app.route(() => Effect.sync(() => order.push("handler")))(
      mockRequest(),
    );

    expect(order).toEqual(["middleware:in", "handler", "middleware:out"]);
  });

  test("multiple use(middleware) calls compose outermost-last", async () => {
    const order: string[] = [];
    const m =
      (label: string) =>
      <A, E, R>(next: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          order.push(`${label}:in`);
          const r = yield* next;
          order.push(`${label}:out`);
          return r;
        });

    const app = App.use(m("A")).use(m("B"));
    await app.route(() => Effect.sync(() => order.push("handler")))(
      mockRequest(),
    );

    expect(order).toEqual(["B:in", "A:in", "handler", "A:out", "B:out"]);
  });

  test("middleware can access a service provided by a layer", async () => {
    const collected: number[] = [];

    const mw: EffectMiddleware<never, CounterService> = (next) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        collected.push(counter.value);
        return yield* next;
      });

    const app = App.use(Layer.succeed(CounterService, { value: 42 })).use(mw);

    await app.route(() => Effect.succeed("done"))(mockRequest());

    expect(collected).toEqual([42]);
  });

  test("middleware can access request Headers", async () => {
    const seenHeaderValues: Array<string | null> = [];

    const mw: EffectMiddleware<never, Headers> = (next) =>
      Effect.gen(function* () {
        const headers = yield* Headers;
        seenHeaderValues.push(headers.get("x-test-header"));
        return yield* next;
      });

    const app = App.use(mw);

    await app.route(() => Effect.succeed("done"))(
      new NextRequest("http://localhost/test", {
        headers: {
          "x-test-header": "middleware-visible",
        },
      }),
    );

    expect(seenHeaderValues).toEqual(["middleware-visible"]);
  });
});
