import { Effect, Schema } from "effect";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import { cookies as nextCookies } from "next/headers";
import { createRequestStateTag } from "./tag";

export class BodyState extends createRequestStateTag("Body")<BodyState, unknown>(
  {
    fromRequest(req) {
      return Effect.tryPromise(() => req.json() as Promise<unknown>).pipe(
        Effect.catchAll(() => Effect.succeed(undefined)),
      );
    },

    forPage() {
      return Effect.promise(() => Promise.resolve(undefined));
    },
  },
) {}

/**
 * The parsed request body. On the route path it is read (and memoized) from the
 * `NextRequest` on first access; on a page it resolves to `undefined`. Reading
 * is lazy, so a handler that never inspects the body pays nothing.
 */
export const Body = Effect.flatMap(BodyState, (resolve) => resolve);

export function* parseBody<T>(schema: Schema.Schema<T>) {
  const body = yield* Body;
  return Schema.decodeUnknownEither(schema)(body);
}
