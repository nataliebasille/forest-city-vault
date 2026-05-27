import { describe, test } from "node:test";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { Context, Effect, Layer } from "effect";
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { make } from "./app";
import { Headers } from "./request/headers";
import { Cookies } from "./request/cookies";
import {
  HttpFailure,
  httpFailure,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  noContent,
} from "./http/http-failure";

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
  test("handler requirement is typed to provided services", () => {
    const handler = (_req: NextRequest) =>
      CounterService.pipe(Effect.map((c) => c.value));

    expectTypeOf<
      Effect.Effect.Context<ReturnType<typeof handler>>
    >().toEqualTypeOf<CounterService>();
  });

  test("yield* Dep in route handler infers service type", () => {
    const handler = (_req: NextRequest) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        return counter.value;
      });

    expectTypeOf<
      Effect.Effect.Context<ReturnType<typeof handler>>
    >().toEqualTypeOf<CounterService>();
    expectTypeOf<
      Effect.Effect.Success<ReturnType<typeof handler>>
    >().toEqualTypeOf<number>();
  });

  test("yield* multiple Deps in route handler merges requirements", () => {
    const handler = (_req: NextRequest) =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        const label = yield* LabelService;
        return `${label.text}:${counter.value}`;
      });

    expectTypeOf<
      Effect.Effect.Context<ReturnType<typeof handler>>
    >().toEqualTypeOf<CounterService | LabelService>();
  });

  test("yield* unprovided Dep in route handler is a type error", () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 1 }),
    );
    // @ts-expect-error - LabelService is not provided by the app
    app.route((_req: NextRequest) =>
      Effect.gen(function* () {
        return yield* LabelService;
      }),
    );
  });

  test("route return type is Promise<Response>", () => {
    const app = make(Layer.empty);
    const routeFn = app.route(() => Effect.succeed(123));
    expectTypeOf<ReturnType<typeof routeFn>>().toEqualTypeOf<
      Promise<Response>
    >();
  });

  test("route return type is always Promise<Response> regardless of middleware", () => {
    const app = make(Layer.empty).use((next) =>
      next.pipe(Effect.map(() => "transformed" as const)),
    );
    const routeFn = app.route(() => Effect.succeed("handled" as const));
    expectTypeOf<ReturnType<typeof routeFn>>().toEqualTypeOf<
      Promise<Response>
    >();
  });

  test("handler requiring an unprovided service is a type error", () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 1 }),
    );
    // @ts-expect-error - LabelService is not provided by the app
    app.route(() => LabelService.pipe(Effect.map((l) => l.text)));
  });

  test("handler with a non-never error channel is a type error", () => {
    const app = make(Layer.empty);
    // @ts-expect-error - Effect.fail produces a non-never error
    app.route(() => Effect.fail(new Error("oops")));
  });

  test("handler with HttpFailure error channel is not a type error", () => {
    const app = make(Layer.empty);
    // HttpFailure is the allowed error type - no @ts-expect-error needed
    app.route(() => httpFailure(422, "unprocessable"));
  });
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

describe("app.route - runtime", () => {
  test("resolves with handler value", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => Effect.succeed("ok"))(mockRequest());
    expect(await response.json()).toBe("ok");
  });

  test("service provided via use() is accessible in route handler", async () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 55 }),
    );
    const response = await app.route(() =>
      CounterService.pipe(Effect.map((c) => c.value)),
    )(mockRequest());
    expect(await response.json()).toBe(55);
  });

  test("yield* Dep resolves the service value at runtime", async () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 21 }),
    );
    const response = await app.route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        return counter.value;
      }),
    )(mockRequest());
    expect(await response.json()).toBe(21);
  });

  test("yield* multiple Deps resolves all service values", async () => {
    const app = make(Layer.empty)
      .use(Layer.succeed(CounterService, { value: 7 }))
      .use(Layer.succeed(LabelService, { text: "hello" }));

    const response = await app.route(() =>
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

  test("Headers and Cookies services are accessible in route handler", async () => {
    const app = make(Layer.empty);
    const req = new NextRequest("http://localhost/test", {
      headers: {
        "x-custom-header": "custom-value",
        cookie: "session=abc123; user=john",
      },
    });

    const response = await app.route(() =>
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
// HttpFailure tests
// ---------------------------------------------------------------------------

describe("app.route - HttpFailure", () => {
  test("HttpFailure is converted to a Response with correct status", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => httpFailure(422, "unprocessable"))(
      mockRequest(),
    );
    expect(response.status).toBe(422);
  });

  test("HttpFailure response body contains the error message", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => httpFailure(500, "internal error"))(
      mockRequest(),
    );
    expect(await response.json()).toEqual({ error: "internal error" });
  });

  test("badRequest produces a 400 response", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => badRequest("bad input"))(
      mockRequest(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad input" });
  });

  test("unauthorized produces a 401 response", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => unauthorized("not authenticated"))(
      mockRequest(),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "not authenticated" });
  });

  test("forbidden produces a 403 response", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => forbidden("access denied"))(
      mockRequest(),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "access denied" });
  });

  test("notFound produces a 404 response", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => notFound("resource missing"))(
      mockRequest(),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "resource missing" });
  });

  test("HttpFailure from a service is caught and converted to a Response", async () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 0 }),
    );
    const response = await app.route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        if (counter.value === 0) return yield* notFound("counter is zero");
        return counter.value;
      }),
    )(mockRequest());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "counter is zero" });
  });

  test("successful handler result is wrapped in a JSON response", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => Effect.succeed("all good"))(
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
    const app = make(Layer.empty);
    const response = await app.route(() => noContent())(mockRequest());
    expect(response.status).toBe(204);
  });

  test("noContent response has no body", async () => {
    const app = make(Layer.empty);
    const response = await app.route(() => noContent())(mockRequest());
    expect(response.body).toBeNull();
  });

  test("noContent from a service is returned correctly", async () => {
    const app = make(Layer.empty).use(
      Layer.succeed(CounterService, { value: 0 }),
    );
    const response = await app.route(() =>
      Effect.gen(function* () {
        const counter = yield* CounterService;
        if (counter.value === 0) return yield* noContent();
        return counter.value;
      }),
    )(mockRequest());
    expect(response.status).toBe(204);
  });
});
