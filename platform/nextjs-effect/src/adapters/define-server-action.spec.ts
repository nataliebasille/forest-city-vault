import { describe, test } from "node:test";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { Context, Effect, Layer } from "effect";
import { Saga } from "@forest-city-vault/platform-saga";
import { compose } from "effect/Function";
import { Headers } from "./request/headers";
import { Cookies } from "./request/cookies";
import { Body } from "./request/body";
import { RequestStateDeps } from "./request/layer";
import {
  defineServerAction,
  testServerAction,
  ServerActionHandler,
} from "./define-server-action";

// ---------------------------------------------------------------------------
// Test services + request-state stand-in
// ---------------------------------------------------------------------------

class CounterService extends Context.Tag("action/Counter")<
  CounterService,
  { value: number }
>() {}

class LabelService extends Context.Tag("action/Label")<
  LabelService,
  { text: string }
>() {}

class TraceService extends Context.Tag("action/Trace")<
  TraceService,
  { requestId: string }
>() {}

// The production request state reads `next/headers`, which is unavailable outside
// a Next.js request. Tests provide their own request-state layer instead.
const requestState = (
  headers: Record<string, string> = {},
): Layer.Layer<RequestStateDeps, never, never> =>
  Layer.mergeAll(
    Layer.succeed(Headers, new globalThis.Headers(headers) as never),
    Layer.succeed(Cookies, {
      get: () => undefined,
      getAll: () => [],
      has: () => false,
      toString: () => "",
    } as never),
    Layer.succeed(Body, undefined),
  );

const test$ = <Args extends readonly unknown[], A, LOut>(
  action: ServerActionHandler<Args, A, LOut>,
  layer: Layer.Layer<LOut, unknown, Saga | RequestStateDeps>,
  headers?: Record<string, string>,
) => testServerAction(action, { layer, requestState: requestState(headers) });

// ---------------------------------------------------------------------------
// Typing tests
// ---------------------------------------------------------------------------

describe("app.serverAction - types", () => {
  test("yield* unprovided Dep in handler is a type error", () => {
    const action = defineServerAction({
      layer: Layer.succeed(CounterService, { value: 1 }),
    });
    action(
      "uses-label",
      // @ts-expect-error - LabelService is not provided by the app
      () => LabelService.pipe(Effect.map((l) => l.text)),
    );
  });

  test("action return type is Promise<A>", () => {
    const actionFn = defineServerAction({ layer: Layer.empty })(
      "answer",
      () => Effect.succeed(123),
    );
    expectTypeOf<ReturnType<typeof actionFn>>().toEqualTypeOf<Promise<number>>();
  });

  test("action forwards its argument list to the handler", () => {
    const actionFn = defineServerAction({ layer: Layer.empty })(
      "concat",
      (a: string, b: number) => Effect.succeed(`${a}:${b}`),
    );
    expectTypeOf<Parameters<typeof actionFn>>().toEqualTypeOf<
      [string, number]
    >();
    expectTypeOf<ReturnType<typeof actionFn>>().toEqualTypeOf<Promise<string>>();
  });

  test("middleware preserves the resolved value type", () => {
    const action = defineServerAction({
      layer: Layer.empty,
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        next.pipe(Effect.tap(() => Effect.void)),
    });
    const actionFn = action("m", () => Effect.succeed("handled" as const));
    expectTypeOf<ReturnType<typeof actionFn>>().toEqualTypeOf<
      Promise<"handled">
    >();
  });
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

describe("app.serverAction - runtime", () => {
  test("resolves with handler value", async () => {
    const action = defineServerAction({ layer: Layer.empty });
    const run = test$(
      action("ok", () => Effect.succeed("ok")),
      Layer.empty,
    );
    expect(await run()).toBe("ok");
  });

  test("forwards arguments to the handler", async () => {
    const action = defineServerAction({ layer: Layer.empty });
    const run = test$(
      action("sum", (a: number, b: number) => Effect.succeed(a + b)),
      Layer.empty,
    );
    expect(await run(2, 3)).toBe(5);
  });

  test("service provided via layer is accessible in handler", async () => {
    const action = defineServerAction({
      layer: Layer.succeed(CounterService, { value: 55 }),
    });
    const run = test$(
      action("counter", () => CounterService.pipe(Effect.map((c) => c.value))),
      Layer.succeed(CounterService, { value: 55 }),
    );
    expect(await run()).toBe(55);
  });

  test("middleware wraps handler", async () => {
    const order: string[] = [];
    const action = defineServerAction({
      layer: Layer.empty,
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          order.push("before");
          const r = yield* next;
          order.push("after");
          return r;
        }),
    });
    await test$(
      action("mw", () => Effect.sync(() => order.push("handler"))),
      Layer.empty,
    )();
    expect(order).toEqual(["before", "handler", "after"]);
  });

  test("middlewares compose pipe-style with the last middleware outermost", async () => {
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

    const action = defineServerAction({
      layer: Layer.empty,
      middleware: compose(m("A"), m("B")),
    });
    await test$(
      action("mw", () => Effect.sync(() => order.push("handler"))),
      Layer.empty,
    )();
    expect(order).toEqual(["B:in", "A:in", "handler", "A:out", "B:out"]);
  });

  test("Headers request state is accessible in the handler", async () => {
    const action = defineServerAction({ layer: Layer.empty });
    const run = test$(
      action("read-header", () =>
        Effect.gen(function* () {
          const headers = yield* Headers;
          return headers.get("x-request-id");
        }),
      ),
      Layer.empty,
      { "x-request-id": "req-123" },
    );
    expect(await run()).toBe("req-123");
  });

  test("a failing handler rejects the returned promise", async () => {
    const action = defineServerAction({ layer: Layer.empty });
    const run = test$(
      action("boom", () => Effect.fail(new Error("kaboom"))),
      Layer.empty,
    );
    await expect(run()).rejects.toThrow("kaboom");
  });

  test("a layer service derived from request headers is visible to the handler", async () => {
    // Mirrors the production request-trace pattern: a service built from the
    // request headers is exposed through the app layer, so the handler can carry
    // a request id without threading it by hand.
    const TraceLayer = Layer.effect(
      TraceService,
      Effect.gen(function* () {
        const headers = yield* Headers;
        return { requestId: headers.get("x-request-id") ?? "generated" };
      }),
    );

    const action = defineServerAction({ layer: TraceLayer });
    const run = test$(
      action("trace", () =>
        TraceService.pipe(Effect.map((t) => t.requestId)),
      ),
      TraceLayer,
      { "x-request-id": "req-abc" },
    );
    expect(await run()).toBe("req-abc");
  });

  test("middleware wraps the handler with request context", async () => {
    const seen: string[] = [];
    const TraceLayer = Layer.effect(
      TraceService,
      Effect.gen(function* () {
        const headers = yield* Headers;
        return { requestId: headers.get("x-request-id") ?? "generated" };
      }),
    );

    const action = defineServerAction({
      layer: TraceLayer,
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const trace = yield* TraceService;
          seen.push(trace.requestId);
          return yield* next.pipe(Effect.annotateLogs(trace));
        }),
    });

    const run = test$(
      action("trace", () => Effect.succeed("done")),
      TraceLayer,
      { "x-request-id": "req-xyz" },
    );
    expect(await run()).toBe("done");
    expect(seen).toEqual(["req-xyz"]);
  });
});

// ---------------------------------------------------------------------------
// testServerAction - dependency override
// ---------------------------------------------------------------------------

describe("app.serverAction - testServerAction overrides", () => {
  test("overrides the layer value in the handler", async () => {
    const action = defineServerAction({
      layer: Layer.succeed(CounterService, { value: 1 }),
    });
    const submit = action("counter", () =>
      CounterService.pipe(Effect.map((c) => c.value)),
    );

    const run = test$(submit, Layer.succeed(CounterService, { value: 999 }));
    expect(await run()).toBe(999);
  });

  test("does not build the production layer", async () => {
    let realBuilt = false;
    const RealCounter = Layer.effect(
      CounterService,
      Effect.sync(() => {
        realBuilt = true;
        return { value: 1 };
      }),
    );

    const action = defineServerAction({ layer: RealCounter });
    const submit = action("counter", () =>
      CounterService.pipe(Effect.map((c) => c.value)),
    );

    const run = test$(submit, Layer.succeed(CounterService, { value: 42 }));
    expect(await run()).toBe(42);
    expect(realBuilt).toBe(false);
  });

  test("preserves middleware behavior under override", async () => {
    const order: string[] = [];
    const action = defineServerAction({
      layer: Layer.succeed(CounterService, { value: 1 }),
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          order.push("before");
          const r = yield* next;
          order.push("after");
          return r;
        }),
    });
    const submit = action("counter", () =>
      CounterService.pipe(Effect.map((c) => c.value)),
    );

    const run = test$(submit, Layer.succeed(CounterService, { value: 5 }));
    expect(await run()).toBe(5);
    expect(order).toEqual(["before", "after"]);
  });
});
