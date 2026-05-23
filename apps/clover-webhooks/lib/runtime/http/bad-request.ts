import { Effect, Schema } from "effect";

export class BadRequest extends Schema.TaggedError<BadRequest>()("BadRequest", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export function badRequest(message: string, cause?: unknown) {
  return Effect.fail(new BadRequest({ message, cause }));
}
