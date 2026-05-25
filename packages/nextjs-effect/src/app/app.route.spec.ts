import { describe, test } from "node:test";
import { expect } from "expect";
import { Context, Effect, Layer } from "effect";
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { make } from "./app";

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

class CounterService extends Context.Tag("route/Counter")<
  CounterService,
  { value: number }
>() {}

class LabelService extends Context.Tag("route/Label")<
  LabelService,
  { text: string }
>() {}

const mockRequest = (url = "http://localhost/test") => new NextRequest(url);

// ---------------------------------------------------------------------------
// Typing tests
// ---------------------------------------------------------------------------

describe("app.route – types", () => {
  test("handler requirement is typed to provided services", () => {
    const handler = (_req: NextRequest) =>
      CounterService.pipe(Effect.map((c) => c.value));

    type _RequiresCounter = Expect<
      Equal<Effect.Effect.Context<ReturnType<typeof handler>>, CounterService>
    >;
  });

  test("yield* Dep in route handler infers service type", () => {
    const handler = (_req: NextRequest) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        return counter.value;
      });

    type _RequiresCounter = Expect<
      Equal<Effect.Effect.Context<ReturnType<typeof handler>>, CounterService>
    >;
    type _ReturnsNumber = Expect<
      Equal<Effect.Effect.Success<ReturnType<typeof handler>>, number>
    >;
  });

  test("yield* multiple Deps in route handler merges requirements", () => {
    const handler = (_req: NextRequest) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const label = yield* LabelService;
        return `${label.text}:${counter.value}`;
      });

    type _RequiresBoth = Expect<
      Equal<
        Effect.Effect.Context<ReturnType<typeof handler>>,
        CounterService | LabelService
      >
    >;
  });

  test("yield* unprovided Dep in route handler is a type error", () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 1 }),
    );
    // @ts-expect-error – LabelService is not provided by the app
    app.route((_req: NextRequest) =>
      Effect.gen(function* () {
        return yield* LabelService;
      }),
    );
  });

  test("route return type is Promise<R>", () => {
    const app = make(Layer.empty);
    const routeFn = app.route(() => Effect.succeed(123));
    type _RouteReturn = Expect<
      Equal<ReturnType<typeof routeFn>, Promise<number>>
    >;
  });

  test("middleware changes the Result type", () => {
    const app = make(Layer.empty).use((next) =>
      next.pipe(Effect.map(() => "transformed" as const)),
    );
    const routeFn = app.route(() => Effect.succeed("handled" as const));
    type _RouteReturn = Expect<
      Equal<ReturnType<typeof routeFn>, Promise<"handled">>
    >;
  });

  test("handler requiring an unprovided service is a type error", () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 1 }),
    );
    // @ts-expect-error – LabelService is not provided by the app
    app.route(() => LabelService.pipe(Effect.map((l) => l.text)));
  });

  test("handler with a non-never error channel is a type error", () => {
    const app = make(Layer.empty);
    // @ts-expect-error – Effect.fail produces a non-never error
    app.route(() => Effect.fail(new Error("oops")));
  });
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

describe("app.route – runtime", () => {
  test("resolves with handler value", async () => {
    const app = make(Layer.empty);
    const result = await app.route(() => Effect.succeed("ok"))(mockRequest());
    expect(result).toBe("ok");
  });

  test("service provided via use() is accessible in route handler", async () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 55 }),
    );
    const result = await app.route(() =>
      CounterService.pipe(Effect.map((c) => c.value)),
    )(mockRequest());
    expect(result).toBe(55);
  });

  test("yield* Dep resolves the service value at runtime", async () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 21 }),
    );
    const result = await app.route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        return counter.value;
      }),
    )(mockRequest());
    expect(result).toBe(21);
  });

  test("yield* multiple Deps resolves all service values", async () => {
    const app = make(Layer.empty)
      .use(Layer.succeed(CounterService, { value: 7 }))
      .use(Layer.succeed(LabelService, { text: "hello" }));

    const result = await app.route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const label = yield* LabelService;
        return `${label.text}:${counter.value}`;
      }),
    )(mockRequest());
    expect(result).toBe("hello:7");
  });

  test("middleware wraps route handler", async () => {
    const order: string[] = [];
    const app = make(Layer.empty).use((next) =>
      Effect.gen(function* () {
        order.push("before");
        const r = yield* next;
        order.push("after");
        return r;
      }),
    );
    await app.route(() => Effect.sync(() => order.push("handler")))(
      mockRequest(),
    );
    expect(order).toEqual(["before", "handler", "after"]);
  });

  test("middlewares compose pipe-style with the last middleware outermost", async () => {
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
});
