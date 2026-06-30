import { Effect } from "effect";
import { headers as nextHeaders } from "next/headers";
import { type NextRequest } from "next/server";
import { createRequestStateTag } from "./tag";

type NextHeaders = Awaited<ReturnType<typeof nextHeaders>>;

export class Headers extends createRequestStateTag("Headers")<
  Headers,
  NextHeaders
>({
  fromRequest(req: NextRequest) {
    return Effect.succeed(req.headers);
  },

  forPage() {
    return Effect.promise(() => nextHeaders());
  },
}) {}

export function* headers() {
  return yield* Headers;
}
