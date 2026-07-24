import { Context, Effect } from "effect";

/**
 * Request-scoped sink for headers a handler wants on the final `Response`.
 *
 * `defineRoute` provides a fresh sink per request and, after building the
 * `Response`, appends every collected header to it. This is the response-side
 * analog of the request-state services (`Cookies`, `Headers`, `Body`): rather
 * than threading a header map through every `HttpResult` constructor, a handler
 * writes headers ambiently with {@link setResponseHeader} and returns whatever
 * `HttpResult` it likes.
 */
export class ResponseHeaders extends Context.Tag(
  "nextjs-effect/http/ResponseHeaders",
)<ResponseHeaders, ResponseHeaderSink>() {}

export interface ResponseHeaderSink {
  readonly entries: Array<readonly [name: string, value: string]>;
}

/**
 * Queue a header to append to the response `defineRoute` ultimately returns.
 *
 * Headers are *appended*, never replaced, so repeated calls with `Set-Cookie`
 * emit multiple cookies. The name and value are written verbatim, so callers
 * must pass already-safe values.
 */
export function setResponseHeader(name: string, value: string) {
  return Effect.gen(function* () {
    const sink = yield* ResponseHeaders;
    sink.entries.push([name, value] as const);
  });
}

/** Creates an empty sink. One is provided per request by `defineRoute`. */
export function emptyResponseHeaderSink(): ResponseHeaderSink {
  return { entries: [] };
}

/** Appends every collected header to `response`, preserving multiples. */
export function applyResponseHeaders(
  response: Response,
  sink: ResponseHeaderSink,
): Response {
  for (const [name, value] of sink.entries) {
    response.headers.append(name, value);
  }
  return response;
}
