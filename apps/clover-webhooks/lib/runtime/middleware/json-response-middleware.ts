// runtime/response-middleware.ts
import { NextResponse } from "next/server";
import { Effect, Layer, Schema } from "effect";
import { NextMiddleware } from "@mcrovero/effect-nextjs";

type ApiResult =
  | Response
  | {
      status?: number;
      headers?: HeadersInit;
      body?: unknown;
    }
  | Record<string, unknown>
  | null
  | undefined;

const isResponse = (value: unknown): value is Response =>
  value instanceof Response;

const toResponse = (value: ApiResult): Response => {
  if (isResponse(value)) {
    return value;
  }

  if (value == null) {
    return new Response(null, { status: 204 });
  }

  // Optional explicit envelope:
  // return { status: 201, body: { id }, headers: { ... } }
  if (
    typeof value === "object" &&
    value !== null &&
    ("body" in value || "status" in value || "headers" in value)
  ) {
    const result = value as {
      status?: number;
      headers?: HeadersInit;
      body?: unknown;
    };

    return NextResponse.json(result.body ?? null, {
      status: result.status ?? 200,
      headers: result.headers,
    });
  }

  return NextResponse.json(value);
};

export class JsonResponseMiddleware extends NextMiddleware.Tag<JsonResponseMiddleware>()(
  "JsonResponseMiddleware",
  {
    wrap: true,
    failure: Schema.Never,
  },
) {}

export const JsonResponseMiddlewareLive = Layer.succeed(
  JsonResponseMiddleware,
  ({ next }) =>
    Effect.gen(function* () {
      const result = yield* next;
      return toResponse(result as ApiResult);
    }),
);
