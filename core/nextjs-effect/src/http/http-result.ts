import { Data, Effect, Schema } from "effect";

export type HttpResult<A> = Data.TaggedEnum<{
  Ok: {
    readonly body: A;
  };

  Error: {
    readonly status: number;
    readonly message: string;
    readonly cause?: unknown;
  };

  NoContent: {};
}>;

interface HttpResultDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: HttpResult<this["A"]>;
}

export const HttpResult = Data.taggedEnum<HttpResultDefinition>();

export function ok<A>(body: A) {
  return Effect.succeed(HttpResult.Ok({ body }));
}

export function httpFailure(status: number, message: string, cause?: unknown) {
  return Effect.fail(HttpResult.Error({ status, message, cause }));
}

export function badRequest(message: string, cause?: unknown) {
  return httpFailure(400, message, cause);
}

export function unauthorized(message: string, cause?: unknown) {
  return httpFailure(401, message, cause);
}

export function forbidden(message: string, cause?: unknown) {
  return httpFailure(403, message, cause);
}

export function notFound(message: string, cause?: unknown) {
  return httpFailure(404, message, cause);
}

export function noContent() {
  return Effect.succeed(HttpResult.NoContent());
}

export const httpResultToResponse = HttpResult.$match({
  Ok: ({ body }) =>
    Response.json(body, {
      status: 200,
    }),

  Error: ({ status, message, cause }) =>
    Response.json(
      {
        error: {
          status,
          message,
          ...(cause === undefined ? {} : { cause }),
        },
      },
      {
        status,
      },
    ),

  NoContent: () =>
    new Response(null, {
      status: 204,
    }),
});
