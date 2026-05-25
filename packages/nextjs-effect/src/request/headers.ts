import { Context, Effect } from "effect";
import { cookies, headers } from "next/headers";
import { type NextRequest } from "next/server";
import { createRequestStateTag } from "./tag";

type NextHeaders = Awaited<ReturnType<typeof headers>>;

export class Headers extends createRequestStateTag("Headers")<
  Headers,
  NextHeaders
>({
  fromRequest(req: NextRequest) {
    return Effect.succeed(req.headers);
  },

  forPage() {
    return Effect.promise(() => headers());
  },
}) {}
