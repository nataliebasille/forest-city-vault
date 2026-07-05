import { describe, test } from "node:test";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { Context, Effect, Layer } from "effect";
import { NextRequest } from "next/server";
import { compose } from "effect/Function";
import { Headers } from "./request/headers";
import { Cookies } from "./request/cookies";
import {
  httpFailure,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  noContent,
} from "../http/http-result";
import { defineRoute, testRoute } from "./define-route";

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

describe("app.route - types", () => {
  test("yield* unprovided Dep in route handler is a type error", () => {
    const route = defineRoute({
      layer: Layer.succeed(CounterService, { value: 1 }),
    });
    // @ts-expect-error - LabelService is not provided by the app
    route((_req: NextRequest) =>
      Effect.gen(function* () {
        return yield* LabelService;
      }),
    );
  });

  test("route return type is Promise<Response>", () => {
    const routeFn = defineRoute({ layer: Layer.empty })(() =>
      Effect.succeed(123),
    );
    expectTypeOf<ReturnType<typeof routeFn>>().toEqualTypeOf<
      Promise<Response>
    >();
  });

  test("route return type is always Promise<Response> regardless of middleware", () => {
    const route = defineRoute({
      layer: Layer.empty,
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        next.pipe(Effect.map(() => "transformed" as const)),
    });
    const routeFn = route(() => Effect.succeed("handled" as const));
    expectTypeOf<ReturnType<typeof routeFn>>().toEqualTypeOf<
      Promise<Response>
    >();
  });

  test("handler requiring an unprovided service is a type error", () => {
    const route = defineRoute({
      layer: Layer.succeed(CounterService, { value: 1 }),
    });
    // @ts-expect-error - LabelService is not provided by the app
    route(() => LabelService.pipe(Effect.map((l) => l.text)));
  });

  test("handler with a non-HttpFailure error channel is allowed", () => {
    const route = defineRoute({ layer: Layer.empty });
    route(() => Effect.fail(new Error("oops")));
  });

  test("handler with HttpFailure error channel is not a type error", () => {
    const route = defineRoute({ layer: Layer.empty });
    // HttpFailure is the allowed error type - no @ts-expect-error needed
    route(() => httpFailure(422, "unprocessable"));
  });
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

describe("app.route - runtime", () => {
  test("resolves with handler value", async () => {
    const route = defineRoute({ layer: Layer.empty });
    const response = await route(() => Effect.succeed("ok"))(mockRequest());
    expect(await response.json()).toBe("ok");
  });

  test("service provided via layer is accessible in route handler", async () => {
    const route = defineRoute({
      layer: Layer.succeed(CounterService, { value: 55 }),
    });
    const response = await route(() =>
      CounterService.pipe(Effect.map((c) => c.value)),
    )(mockRequest());
    expect(await response.json()).toBe(55);
  });

  test("yield* Dep resolves the service value at runtime", async () => {
    const route = defineRoute({
      layer: Layer.succeed(CounterService, { value: 21 }),
    });
    const response = await route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        return counter.value;
      }),
    )(mockRequest());
    expect(await response.json()).toBe(21);
  });

  test("yield* multiple Deps resolves all service values", async () => {
    const route = defineRoute({
      layer: Layer.merge(
        Layer.succeed(CounterService, { value: 7 }),
        Layer.succeed(LabelService, { text: "hello" }),
      ),
    });

    const response = await route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const label = yield* LabelService;
        return `${label.text}:${counter.value}`;
      }),
    )(mockRequest());
    expect(await response.json()).toBe("hello:7");
  });

  test("middleware wraps route handler", async () => {
    const order: string[] = [];
    const route = defineRoute({
      layer: Layer.empty,
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          order.push("before");
          const r = yield* next;
          order.push("after");
          return r;
        }),
    });
    await route(() => Effect.sync(() => order.push("handler")))(mockRequest());
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

    const route = defineRoute({
      layer: Layer.empty,
      middleware: compose(m("A"), m("B")),
    });
    await route(() => Effect.sync(() => order.push("handler")))(mockRequest());
    expect(order).toEqual(["B:in", "A:in", "handler", "A:out", "B:out"]);
  });

  test("Headers and Cookies services are accessible in route handler", async () => {
    const req = new NextRequest("http://localhost/test", {
      headers: {
        "x-custom-header": "custom-value",
        cookie: "session=abc123; user=john",
      },
    });

    const route = defineRoute({ layer: Layer.empty });
    const response = await route(() =>
      Effect.gen(function* () {
        const headers = yield* Headers;
        const cookies = yield* Cookies;
        return {
          customHeader: headers.get("x-custom-header"),
          hasSessionCookie: cookies.has("session"),
          cookieCount: cookies.getAll().length,
        };
      }),
    )(req);
    expect(await response.json()).toEqual({
      customHeader: "custom-value",
      hasSessionCookie: true,
      cookieCount: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// testRoute - dependency override
// ---------------------------------------------------------------------------

describe("app.route - testRoute overrides", () => {
  test("testRoute overrides the layer value in the handler", async () => {
    const route = defineRoute({
      layer: Layer.succeed(CounterService, { value: 1 }),
    });
    const POST = route(() => CounterService.pipe(Effect.map((c) => c.value)));

    const response = await testRoute(POST, {
      layer: Layer.succeed(CounterService, { value: 999 }),
    })(mockRequest());

    expect(await response.json()).toBe(999);
  });

  test("testRoute does not build the production layer", async () => {
    let realBuilt = false;
    const RealCounter = Layer.effect(
      CounterService,
      Effect.sync(() => {
        realBuilt = true;
        return { value: 1 };
      }),
    );

    const route = defineRoute({ layer: RealCounter });
    const POST = route(() => CounterService.pipe(Effect.map((c) => c.value)));

    const response = await testRoute(POST, {
      layer: Layer.succeed(CounterService, { value: 42 }),
    })(mockRequest());

    expect(await response.json()).toBe(42);
    expect(realBuilt).toBe(false);
  });

  test("production call still builds the real layer", async () => {
    let realBuilt = false;
    const RealCounter = Layer.effect(
      CounterService,
      Effect.sync(() => {
        realBuilt = true;
        return { value: 7 };
      }),
    );

    const route = defineRoute({ layer: RealCounter });
    const POST = route(() => CounterService.pipe(Effect.map((c) => c.value)));

    const response = await POST(mockRequest());

    expect(await response.json()).toBe(7);
    expect(realBuilt).toBe(true);
  });

  test("testRoute preserves middleware behavior", async () => {
    const order: string[] = [];
    const route = defineRoute({
      layer: Layer.succeed(CounterService, { value: 1 }),
      middleware: <A, E, R>(next: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          order.push("before");
          const r = yield* next;
          order.push("after");
          return r;
        }),
    });
    const POST = route(() => CounterService.pipe(Effect.map((c) => c.value)));

    const response = await testRoute(POST, {
      layer: Layer.succeed(CounterService, { value: 5 }),
    })(mockRequest());

    expect(await response.json()).toBe(5);
    expect(order).toEqual(["before", "after"]);
  });
});

// ---------------------------------------------------------------------------
// HttpFailure tests
// ---------------------------------------------------------------------------

describe("app.route - HttpFailure", () => {
  test("HttpFailure is converted to a Response with correct status", async () => {
    const response = await defineRoute({ layer: Layer.empty })(() =>
      httpFailure(422, "unprocessable"),
    )(mockRequest());
    expect(response.status).toBe(422);
  });

  test("HttpFailure response body contains the error message", async () => {
    const response = await defineRoute({ layer: Layer.empty })(() =>
      httpFailure(500, "internal error"),
    )(mockRequest());
    expect(await response.json()).toEqual({
      error: { status: 500, message: "internal error" },
    });
  });

  test("badRequest produces a 400 response", async () => {
    const response = await defineRoute({ layer: Layer.empty })(() =>
      badRequest("bad input"),
    )(mockRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { status: 400, message: "bad input" },
    });
  });

  test("unauthorized produces a 401 response", async () => {
    const response = await defineRoute({ layer: Layer.empty })(() =>
      unauthorized("not authenticated"),
    )(mockRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { status: 401, message: "not authenticated" },
    });
  });

  test("forbidden produces a 403 response", async () => {
    const response = await defineRoute({ layer: Layer.empty })(() =>
      forbidden("access denied"),
    )(mockRequest());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { status: 403, message: "access denied" },
    });
  });

  test("notFound produces a 404 response", async () => {
    const response = await defineRoute({ layer: Layer.empty })(() =>
      notFound("resource missing"),
    )(mockRequest());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { status: 404, message: "resource missing" },
    });
  });

  test("HttpFailure from a service is caught and converted to a Response", async () => {
    const route = defineRoute({
      layer: Layer.succeed(CounterService, { value: 0 }),
    });
    const response = await route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        if (counter.value === 0) return yield* notFound("counter is zero");
        return counter.value;
      }),
    )(mockRequest());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { status: 404, message: "counter is zero" },
    });
  });

  test("successful handler result is wrapped in a JSON response", async () => {
    const route = defineRoute({ layer: Layer.empty });
    const response = await route(() => Effect.succeed("all good"))(
      mockRequest(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toBe("all good");
  });
});

// ---------------------------------------------------------------------------
// noContent tests
// ---------------------------------------------------------------------------

describe("app.route - noContent", () => {
  test("noContent produces a 204 response", async () => {
    const route = defineRoute({ layer: Layer.empty });
    const response = await route(() => noContent())(mockRequest());
    expect(response.status).toBe(204);
  });

  test("noContent response has no body", async () => {
    const route = defineRoute({ layer: Layer.empty });
    const response = await route(() => noContent())(mockRequest());
    expect(response.body).toBeNull();
  });

  test("noContent from a service is returned correctly", async () => {
    const route = defineRoute({
      layer: Layer.succeed(CounterService, { value: 0 }),
    });
    const response = await route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        if (counter.value === 0) return yield* noContent();
        return counter.value;
      }),
    )(mockRequest());
    expect(response.status).toBe(204);
  });
});
