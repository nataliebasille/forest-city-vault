import { Headers } from "@forest-city-vault/platform-nextjs-effect";
import { Context, Effect, Layer } from "effect";

export const REQUEST_ID_HEADER = "x-request-id";

type RequestIdSource = "generated" | "incoming";

export type RequestTraceEntity = {
  readonly requestId: string;
  readonly requestIdSource: RequestIdSource;
};

/**
 * Accepts request ids that are short and made only of URL-safe token characters,
 * so a hostile or malformed incoming header can never poison our logs.
 */
const isValidRequestId = (value: string) =>
  value.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(value);

/**
 * The request id (and where it came from) that identifies a single server-action
 * invocation. Handlers `yield* RequestTrace` to correlate their own logs; the
 * boundary middleware annotates every log with it automatically.
 */
export class RequestTrace extends Context.Tag("marketing-site/request-trace")<
  RequestTrace,
  RequestTraceEntity
>() {}

/**
 * Derives the request trace from the ambient request headers: reuses a valid
 * incoming `x-request-id`, otherwise mints one. Provided as a layer (rather than
 * via middleware) so it participates in `defineServerAction`'s dependency check —
 * the handler simply requires {@link RequestTrace} and the boundary guarantees it.
 */
export const RequestTraceLayer = Layer.effect(
  RequestTrace,
  Effect.gen(function* () {
    const headers = yield* Headers;
    const incoming = headers.get(REQUEST_ID_HEADER);

    const requestId =
      typeof incoming === "string" && isValidRequestId(incoming) ?
        incoming
      : crypto.randomUUID();

    return {
      requestId,
      requestIdSource: requestId === incoming ? "incoming" : "generated",
    } satisfies RequestTraceEntity;
  }),
);

/**
 * Wraps a server action so every log the handler emits is annotated with the
 * request trace. Applied as the innermost transform in {@link action}, purely for
 * log correlation — it leaves the success and error channels untouched.
 */
export const RequestTraceMiddleware = (
  self: Effect.Effect<unknown, unknown, unknown>,
) =>
  Effect.gen(function* () {
    const trace = yield* RequestTrace;
    return yield* self.pipe(Effect.annotateLogs(trace));
  });
