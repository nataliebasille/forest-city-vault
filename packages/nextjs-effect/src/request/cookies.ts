import { Effect } from "effect";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import { cookies } from "next/headers";
import { createRequestStateTag } from "./tag";

type CookieStore = Pick<
  Awaited<ReturnType<typeof cookies>>,
  "get" | "getAll" | "has" | "toString"
>;

export class Cookies extends createRequestStateTag("Cookies")<
  Cookies,
  CookieStore
>({
  fromRequest(req) {
    return Effect.succeed(new RequestCookies(req.headers));
  },

  forPage() {
    return Effect.promise(() => cookies());
  },
}) {}
