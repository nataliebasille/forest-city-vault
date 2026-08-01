import { Effect } from "effect";
import { headers as nextHeaders } from "next/headers";
import { type NextRequest } from "next/server";
import { createRequestStateTag } from "./tag";

type NextHeaders = Awaited<ReturnType<typeof nextHeaders>>;

export class HeadersState extends createRequestStateTag("Headers")<
  HeadersState,
  NextHeaders
>({
  fromRequest(req: NextRequest) {
    return Effect.succeed(req.headers);
  },

  forPage() {
    return Effect.promise(() => nextHeaders());
  },
}) {}

/**
 * Reads the ambient request headers. On a page this calls `next/headers`'
 * `headers()` **lazily** — only when a handler yields this — and memoizes the
 * result per request, so pages that never read headers are not forced into
 * dynamic rendering. `yield* Headers` resolves to the headers value directly.
 */
export const Headers = Effect.flatMap(HeadersState, (resolve) => resolve);

export function* headers() {
  return yield* Headers;
}
