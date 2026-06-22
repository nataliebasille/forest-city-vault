import { Effect, Schema } from "effect";

export class HttpFailure extends Schema.TaggedError<HttpFailure>()(
  "HttpFailure",
  {
    status: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export const isHttpFailure = Schema.is(HttpFailure);

export function httpFailure(status: number, message: string, cause?: unknown) {
  return Effect.fail(new HttpFailure({ status, message, cause }));
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

export class NoContent {
  readonly _tag = "NoContent" as const;
}

export function noContent() {
  return Effect.succeed(new NoContent());
}
