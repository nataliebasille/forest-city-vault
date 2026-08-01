import { Effect } from "effect";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import { cookies as nextCookies } from "next/headers";
import { createRequestStateTag } from "./tag";

type CookieStore = Pick<
  Awaited<ReturnType<typeof nextCookies>>,
  "get" | "getAll" | "has" | "toString"
>;

export class CookiesState extends createRequestStateTag("Cookies")<
  CookiesState,
  CookieStore
>({
  fromRequest(req) {
    return Effect.succeed(new RequestCookies(req.headers));
  },

  forPage() {
    return Effect.promise(() => nextCookies());
  },
}) {}

/**
 * Reads the ambient request cookies. On a page this calls `next/headers`'
 * `cookies()` **lazily** — only when a handler yields this — and memoizes the
 * result per request, so pages that never read cookies are not forced into
 * dynamic rendering. `yield* Cookies` resolves to the cookie store directly.
 */
export const Cookies = Effect.flatMap(CookiesState, (resolve) => resolve);

export function* cookies() {
  return yield* Cookies;
}
