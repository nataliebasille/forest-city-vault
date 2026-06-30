import { Effect, Schema } from "effect";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import { cookies as nextCookies } from "next/headers";
import { createRequestStateTag } from "./tag";

export class Body extends createRequestStateTag("Body")<Body, unknown>({
  fromRequest(req) {
    return Effect.tryPromise(() => req.json() as Promise<unknown>).pipe(
      Effect.catchAll(() => Effect.succeed(undefined)),
    );
  },

  forPage() {
    return Effect.promise(() => Promise.resolve(undefined));
  },
}) {}

export function* parseBody<T>(schema: Schema.Schema<T>) {
  const body = yield* Body;
  return Schema.decodeUnknownEither(schema)(body);
}
