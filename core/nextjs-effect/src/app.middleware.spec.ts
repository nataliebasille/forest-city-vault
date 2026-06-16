import { describe, test } from "node:test";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { Context, Effect, Layer } from "effect";
import { defineMiddleware } from "./middleware/define-middleware";
import { make } from "./app";
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { Headers } from "./request/headers";

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

class CounterService extends Context.Tag("middleware/Counter")<
  CounterService,
  { value: number }
>() {}

class LabelService extends Context.Tag("middleware/Label")<
  LabelService,
  { text: string }
>() {}

const mockRequest = (url = "http://localhost/test") => new NextRequest(url);

// ---------------------------------------------------------------------------
// defineMiddleware – type tests
// ---------------------------------------------------------------------------

describe("defineMiddleware – types", () => {
  test("identity middleware preserves success type", () => {
    const mw = defineMiddleware()((next) => next);
    const effect = Effect.succeed(42);
    const result = mw(effect);

    expectTypeOf<
      Effect.Effect.Success<typeof result>
    >().toEqualTypeOf<number>();
  });

  test("middleware can narrow the success type via map", () => {
    const mw = defineMiddleware()((next) =>
      next.pipe(Effect.map(() => "transformed" as const)),
    );
    const effect = Effect.succeed(42);
    const result = mw(effect);

    expectTypeOf<
      Effect.Effect.Success<typeof result>
    >().toEqualTypeOf<"transformed">();
  });

  test("middleware that requires a service adds it to the context", () => {
    const mw = defineMiddleware()((next) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const result = yield* next;
        return { result, extra: counter.value };
      }),
    );
    const effect = Effect.succeed("hello");
    const result = mw(effect);

    expectTypeOf<
      Effect.Effect.Context<typeof result>
    >().toExtend<CounterService>();
  });

  test("middleware can add an error to the error channel", () => {
    class MyError {
      readonly _tag = "MyError" as const;
    }
    const mw = defineMiddleware()((next) =>
      Effect.gen(function* () {
        if (Math.random() < 0) return yield* Effect.fail(new MyError());
        return yield* next;
      }),
    );
    const effect = Effect.succeed(42);
    const result = mw(effect);

    expectTypeOf<Effect.Effect.Error<typeof result>>().toExtend<MyError>();
  });

  test("middleware that merges multiple services requires all of them", () => {
    const mw = defineMiddleware()((next) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const label = yield* LabelService;
        const result = yield* next;
        return { result, counter: counter.value, label: label.text };
      }),
    );
    const effect = Effect.succeed(0);
    const result = mw(effect);

    expectTypeOf<Effect.Effect.Context<typeof result>>().toExtend<
      CounterService | LabelService
    >();
  });
});

// ---------------------------------------------------------------------------
// App.make().use(middleware) – type tests
// ---------------------------------------------------------------------------

describe("App.make().use(middleware) – types", () => {
  test("app with middleware still exposes route when error is never", () => {
    const app = make(Layer.empty).use(
      (next: Effect.Effect<unknown, never>) => next,
    );
    expectTypeOf<typeof app>().toExtend<{ route: Function }>();
  });

  test("app with error-producing middleware loses route", () => {
    class MyError {
      readonly _tag = "MyError" as const;
    }
    const app = make(Layer.empty).use((_next: Effect.Effect<unknown, never>) =>
      Effect.fail(new MyError()),
    );
    expectTypeOf<typeof app>().not.toExtend<{ route: Function }>();
  });

  test("middleware that transforms success type is reflected on app", () => {
    const app = make(Layer.empty).use((next: Effect.Effect<unknown, never>) =>
      next.pipe(Effect.map(() => "string result" as const)),
    );
    expectTypeOf<typeof app>().toExtend<{ use: Function }>();
  });

  test("chaining multiple use(middleware) calls keeps route when errors stay never", () => {
    const m = (label: string) => (next: Effect.Effect<unknown, never>) =>
      Effect.gen(function* () {
        const r = yield* next;
        return `${label}:${r}`;
      });

    const app = make(Layer.empty).use(m("A")).use(m("B"));
    expectTypeOf<typeof app>().toExtend<{ route: Function }>();
  });

  test("middleware requiring a service already provided by use(layer) is satisfied", () => {
    const mw = (next: Effect.Effect<unknown, never, CounterService>) =>
      Effect.gen(function* () {
        yield* CounterService;
        return yield* next;
      });

    const app = make(Layer.empty)
      .use(Layer.succeed(CounterService, { value: 1 }))
      .use(mw);

    expectTypeOf<typeof app>().toExtend<{ route: Function }>();
  });
});

// ---------------------------------------------------------------------------
// middleware(effect) – runtime tests
// ---------------------------------------------------------------------------

describe("middleware(effect) – runtime", () => {
  test("identity middleware returns the effect value unchanged", async () => {
    const mw = defineMiddleware()((next) => next);
    const result = await Effect.runPromise(mw(Effect.succeed(42)));
    expect(result).toBe(42);
  });

  test("middleware can transform the value", async () => {
    const mw = defineMiddleware()((next) =>
      next.pipe(Effect.map((n) => (n as number) * 2)),
    );
    const result = await Effect.runPromise(
      mw(Effect.succeed(7)) as Effect.Effect<number, never, never>,
    );
    expect(result).toBe(14);
  });

  test("middleware runs before and after the effect", async () => {
    const order: string[] = [];
    const mw = defineMiddleware()((next) =>
      Effect.gen(function* () {
        order.push("before");
        const r = yield* next;
        order.push("after");
        return r;
      }),
    );

    await Effect.runPromise(mw(Effect.sync(() => order.push("inner"))));

    expect(order).toEqual(["before", "inner", "after"]);
  });

  test("middleware requiring a service resolves when provided via provideLayer", async () => {
    const mw = defineMiddleware()((next) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const r = yield* next;
        return { r, extra: counter.value };
      }),
    );

    const result = await Effect.runPromise(
      mw(Effect.succeed("ok")).pipe(
        Effect.provide(Layer.succeed(CounterService, { value: 99 })),
      ),
    );

    expect(result).toEqual({ r: "ok", extra: 99 });
  });

  test("multiple middlewares compose: outermost middleware called last wraps all", async () => {
    const order: string[] = [];

    const mw = (label: string) => (next: Effect.Effect<void, never, never>) =>
      Effect.gen(function* () {
        order.push(`${label}:in`);
        yield* next;
        order.push(`${label}:out`);
      });

    const inner = Effect.sync(() => order.push("effect"));
    const composed = mw("B")(mw("A")(inner));

    await Effect.runPromise(composed);

    expect(order).toEqual(["B:in", "A:in", "effect", "A:out", "B:out"]);
  });
});

// ---------------------------------------------------------------------------
// App.make().use(middleware) – runtime tests
// ---------------------------------------------------------------------------

describe("App.make().use(middleware) – runtime", () => {
  test("middleware added via use() runs when route is called", async () => {
    const order: string[] = [];
    const app = make(Layer.empty).use((next) =>
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
    const m = (label: string) => (next: Effect.Effect<unknown, never>) =>
      Effect.gen(function* () {
        order.push(`${label}:in`);
        const r = yield* next;
        order.push(`${label}:out`);
        return r;
      });

    const app = make(Layer.empty).use(m("A")).use(m("B"));
    await app.route(() => Effect.sync(() => order.push("handler")))(
      mockRequest(),
    );

    expect(order).toEqual(["B:in", "A:in", "handler", "A:out", "B:out"]);
  });

  test("middleware added via use() can access a service provided by a layer", async () => {
    const collected: number[] = [];

    const app = make(Layer.empty)
      .use(Layer.succeed(CounterService, { value: 42 }))
      .use((next: Effect.Effect<unknown, never, CounterService>) =>
        Effect.gen(function* () {
          const counter = yield* CounterService;
          collected.push(counter.value);
          return yield* next;
        }),
      );

    await app.route(() => Effect.succeed("done"))(mockRequest());

    expect(collected).toEqual([42]);
  });

  test("middleware added via use() can access request Headers", async () => {
    const seenHeaderValues: Array<string | null> = [];

    const app = make(Layer.empty).use((next) =>
      Effect.gen(function* () {
        const headers = yield* Headers;
        seenHeaderValues.push(headers.get("x-test-header"));
        return yield* next;
      }),
    );

    await app.route(() => Effect.succeed("done"))(
      new NextRequest("http://localhost/test", {
        headers: {
          "x-test-header": "middleware-visible",
        },
      }),
    );

    expect(seenHeaderValues).toEqual(["middleware-visible"]);
  });

  test("middleware defined with defineMiddleware() works via use()", async () => {
    const order: string[] = [];

    const mw = defineMiddleware()((next) =>
      Effect.gen(function* () {
        order.push("mw:in");
        const r = yield* next;
        order.push("mw:out");
        return r;
      }),
    );

    const app = make(Layer.empty).use(mw);
    await app.route(() => Effect.sync(() => order.push("handler")))(
      mockRequest(),
    );

    expect(order).toEqual(["mw:in", "handler", "mw:out"]);
  });
});
