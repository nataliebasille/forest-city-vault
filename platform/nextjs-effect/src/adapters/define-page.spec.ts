import { describe, test } from "node:test";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { Context, Effect, Layer } from "effect";
import { compose } from "effect/Function";
import { redirect as nextRedirect } from "next/navigation";
import { Headers, HeadersState } from "./request/headers";
import { CookiesState } from "./request/cookies";
import { BodyState } from "./request/body";
import { RequestStateDeps } from "./request/layer";
import { definePage, testPage, PageHandler } from "./define-page";

// ---------------------------------------------------------------------------
// Test services + request-state stand-in
// ---------------------------------------------------------------------------

class CounterService extends Context.Tag("page/Counter")<
  CounterService,
  { value: number }
>() {}

class LabelService extends Context.Tag("page/Label")<
  LabelService,
  { text: string }
>() {}

class TraceService extends Context.Tag("page/Trace")<
  TraceService,
  { requestId: string }
>() {}

// The production request state reads `next/headers`, which is unavailable outside
// a Next.js request. Tests provide their own request-state layer instead.
const requestState = (
  headers: Record<string, string> = {},
): Layer.Layer<RequestStateDeps, never, never> =>
  Layer.mergeAll(
    Layer.succeed(
      HeadersState,
      Effect.succeed(new globalThis.Headers(headers) as never),
    ),
    Layer.succeed(
      CookiesState,
      Effect.succeed({
        get: () => undefined,
        getAll: () => [],
        has: () => false,
        toString: () => "",
      } as never),
    ),
    Layer.succeed(BodyState, Effect.succeed(undefined)),
  );

const test$ = <Props, A, LOut>(
  page: PageHandler<Props, A, LOut>,
  layer: Layer.Layer<LOut, unknown, RequestStateDeps>,
  headers?: Record<string, string>,
) => testPage(page, { layer, requestState: requestState(headers) });

// ---------------------------------------------------------------------------
// Typing tests
// ---------------------------------------------------------------------------

describe("app.page - types", () => {
  test("yield* unprovided Dep in handler is a type error", () => {
    const page = definePage({
      layer: Layer.succeed(CounterService, { value: 1 }),
    });
    page(
      "uses-label",
      // @ts-expect-error - LabelService is not provided by the app
      () => LabelService.pipe(Effect.map((l) => l.text)),
    );
  });

  test("middleware requiring an unprovided service is a type error", () => {
    // A middleware is layer-aware: its requirement channel is bounded by the
    // configured layer, so requiring a service the layer does not provide
    // (LabelService) is rejected at the `definePage` call.
    const layer = Layer.succeed(CounterService, { value: 1 });
    const readsUnprovided = <A, E, R>(next: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        yield* LabelService;
        return yield* next;
      });
    definePage({
      layer,
      // @ts-expect-error - LabelService is not provided by the configured layer
      middleware: readsUnprovided,
    });
  });

  test("page return type is Promise<A>", () => {
    const pageFn = definePage({ layer: Layer.empty })("home", () =>
      Effect.succeed("<main />"),
    );
    expectTypeOf<ReturnType<typeof pageFn>>().toEqualTypeOf<Promise<string>>();
  });

  test("page forwards its props object to the handler", () => {
    const pageFn = definePage({ layer: Layer.empty })(
      "vendor",
      (props: { params: Promise<{ slug: string }> }) =>
        Effect.promise(() => props.params).pipe(Effect.map((p) => p.slug)),
    );
    expectTypeOf<Parameters<typeof pageFn>>().toEqualTypeOf<
      [{ params: Promise<{ slug: string }> }]
    >();
    expectTypeOf<ReturnType<typeof pageFn>>().toEqualTypeOf<Promise<string>>();
  });

  test("middleware preserves the resolved value type", () => {
    const page = definePage({
      layer: Layer.empty,
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        next.pipe(Effect.tap(() => Effect.void)),
    });
    const pageFn = page("m", () => Effect.succeed("rendered" as const));
    expectTypeOf<ReturnType<typeof pageFn>>().toEqualTypeOf<
      Promise<"rendered">
    >();
  });
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

describe("app.page - runtime", () => {
  test("resolves with handler value", async () => {
    const page = definePage({ layer: Layer.empty });
    const run = test$(
      page("ok", () => Effect.succeed("ok")),
      Layer.empty,
    );
    expect(await run(undefined)).toBe("ok");
  });

  test("forwards props to the handler", async () => {
    const page = definePage({ layer: Layer.empty });
    const run = test$(
      page("slug", (props: { params: Promise<{ slug: string }> }) =>
        Effect.promise(() => props.params).pipe(Effect.map((p) => p.slug)),
      ),
      Layer.empty,
    );
    expect(await run({ params: Promise.resolve({ slug: "acme" }) })).toBe(
      "acme",
    );
  });

  test("service provided via layer is accessible in handler", async () => {
    const page = definePage({
      layer: Layer.succeed(CounterService, { value: 55 }),
    });
    const run = test$(
      page("counter", () => CounterService.pipe(Effect.map((c) => c.value))),
      Layer.succeed(CounterService, { value: 55 }),
    );
    expect(await run(undefined)).toBe(55);
  });

  test("middleware wraps handler", async () => {
    const order: string[] = [];
    const page = definePage({
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
      page("mw", () => Effect.sync(() => order.push("handler"))),
      Layer.empty,
    )(undefined);
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

    const page = definePage({
      layer: Layer.empty,
      middleware: compose(m("A"), m("B")),
    });
    await test$(
      page("mw", () => Effect.sync(() => order.push("handler"))),
      Layer.empty,
    )(undefined);
    expect(order).toEqual(["B:in", "A:in", "handler", "A:out", "B:out"]);
  });

  test("Headers request state is accessible in the handler", async () => {
    const page = definePage({ layer: Layer.empty });
    const run = test$(
      page("read-header", () =>
        Effect.gen(function* () {
          const headers = yield* Headers;
          return headers.get("x-request-id");
        }),
      ),
      Layer.empty,
      { "x-request-id": "req-123" },
    );
    expect(await run(undefined)).toBe("req-123");
  });

  test("does not read request state unless the handler accesses it", async () => {
    // Providing the page request-state layer must not touch `next/headers`:
    // only a handler that actually reads it should. This is what keeps a page
    // that ignores request state eligible for static rendering instead of being
    // forced dynamic by an unconditional `headers()`/`cookies()` call.
    let headerReads = 0;
    const spyRequestState = Layer.mergeAll(
      Layer.succeed(
        HeadersState,
        Effect.sync(() => {
          headerReads++;
          return new globalThis.Headers({ "x-request-id": "req-1" }) as never;
        }),
      ),
      Layer.succeed(
        CookiesState,
        Effect.succeed({
          get: () => undefined,
          getAll: () => [],
          has: () => false,
          toString: () => "",
        } as never),
      ),
      Layer.succeed(BodyState, Effect.succeed(undefined)),
    );

    const page = definePage({ layer: Layer.empty });

    const noRead = testPage(
      page("no-read", () => Effect.succeed("static")),
      {
        layer: Layer.empty,
        requestState: spyRequestState,
      },
    );
    expect(await noRead(undefined)).toBe("static");
    expect(headerReads).toBe(0);

    const reads = testPage(
      page("reads", () =>
        Effect.gen(function* () {
          const h = yield* Headers;
          return h.get("x-request-id");
        }),
      ),
      { layer: Layer.empty, requestState: spyRequestState },
    );
    expect(await reads(undefined)).toBe("req-1");
    expect(headerReads).toBe(1);
  });

  test("a failing handler rejects the returned promise", async () => {
    const page = definePage({ layer: Layer.empty });
    const run = test$(
      page("boom", () => Effect.fail(new Error("kaboom"))),
      Layer.empty,
    );
    await expect(run(undefined)).rejects.toThrow("kaboom");
  });

  test("a defect in the handler rejects the returned promise", async () => {
    const page = definePage({ layer: Layer.empty });
    const run = test$(
      page("defect", () =>
        Effect.sync(() => {
          throw new Error("render exploded");
        }),
      ),
      Layer.empty,
    );
    await expect(run(undefined)).rejects.toThrow("render exploded");
  });

  test("re-raises redirect() from the handler as Next's control-flow error", async () => {
    // `redirect()` throws Next's control-flow signal. The boundary must re-raise
    // the *original* error — carrying the `NEXT_REDIRECT` digest Next reads to
    // perform the navigation — rather than wrapping it (which would 500).
    const page = definePage({ layer: Layer.empty });
    const run = test$(
      page("gated", () => Effect.sync(() => nextRedirect("/login"))),
      Layer.empty,
    );
    await expect(run(undefined)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  test("re-raises a redirect thrown while building the layer", async () => {
    // Mirrors the auth gate: the redirect is thrown constructing a service the
    // handler depends on, so the handler never runs. It must still surface as
    // Next's control-flow error.
    const GatedUser = Context.GenericTag<{ id: string }>("page/GatedUser");
    const GateLayer = Layer.effect(
      GatedUser,
      Effect.sync(() => nextRedirect("/login")),
    );

    const page = definePage({ layer: GateLayer });
    const run = test$(
      page("gated-layer", () => GatedUser.pipe(Effect.map((u) => u.id))),
      GateLayer,
    );
    await expect(run(undefined)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
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

    const page = definePage({ layer: TraceLayer });
    const run = test$(
      page("trace", () => TraceService.pipe(Effect.map((t) => t.requestId))),
      TraceLayer,
      { "x-request-id": "req-abc" },
    );
    expect(await run(undefined)).toBe("req-abc");
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

    const page = definePage({
      layer: TraceLayer,
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const trace = yield* TraceService;
          seen.push(trace.requestId);
          return yield* next.pipe(Effect.annotateLogs(trace));
        }),
    });

    const run = test$(
      page("trace", () => Effect.succeed("done")),
      TraceLayer,
      { "x-request-id": "req-xyz" },
    );
    expect(await run(undefined)).toBe("done");
    expect(seen).toEqual(["req-xyz"]);
  });
});

// ---------------------------------------------------------------------------
// testPage - dependency override
// ---------------------------------------------------------------------------

describe("app.page - testPage overrides", () => {
  test("overrides the layer value in the handler", async () => {
    const page = definePage({
      layer: Layer.succeed(CounterService, { value: 1 }),
    });
    const render = page("counter", () =>
      CounterService.pipe(Effect.map((c) => c.value)),
    );

    const run = test$(render, Layer.succeed(CounterService, { value: 999 }));
    expect(await run(undefined)).toBe(999);
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

    const page = definePage({ layer: RealCounter });
    const render = page("counter", () =>
      CounterService.pipe(Effect.map((c) => c.value)),
    );

    const run = test$(render, Layer.succeed(CounterService, { value: 42 }));
    expect(await run(undefined)).toBe(42);
    expect(realBuilt).toBe(false);
  });

  test("preserves middleware behavior under override", async () => {
    const order: string[] = [];
    const trackingMiddleware = <A, E, R>(next: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        order.push("before");
        const r = yield* next;
        order.push("after");
        return r;
      });
    const layer = Layer.succeed(CounterService, { value: 1 });
    const page = definePage({
      layer,
      middleware: trackingMiddleware,
    });
    const render = page("counter", () =>
      CounterService.pipe(Effect.map((c) => c.value)),
    );

    const run = test$(render, Layer.succeed(CounterService, { value: 5 }));
    expect(await run(undefined)).toBe(5);
    expect(order).toEqual(["before", "after"]);
  });
});
