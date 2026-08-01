import { Headers } from "@forest-city-vault/platform-nextjs-effect";
import { Context, Effect, Layer } from "effect";

export const REQUEST_ID_HEADER = "x-request-id";

type RequestIdSource = "generated" | "incoming";

export type RequestTraceEntity = {
  requestId: string;
  requestIdSource: RequestIdSource;
  // method: string;
  // url: string;
};

/**
 * The request id (and where it came from) that identifies a single request.
 * Handlers `yield* RequestTrace` to correlate their own logs; the boundary
 * middleware annotates every log with it automatically.
 */
export class RequestTrace extends Context.Tag("clover-webhooks/request-trace")<
  RequestTrace,
  RequestTraceEntity
>() {}

/**
 * Derives the request trace from the ambient request headers: reuses a valid
 * incoming `x-request-id`, otherwise mints one. Provided as a layer (rather than
 * via middleware) so it participates in `defineRoute`'s dependency check — the
 * handler simply requires {@link RequestTrace} and the boundary guarantees it.
 */
export const RequestTraceLayer = Layer.effect(
  RequestTrace,
  Effect.gen(function* () {
    const headers = yield* Headers;
    const requestIdHeader = headers.get(REQUEST_ID_HEADER);

    const requestId =
      typeof requestIdHeader === "string" && isValidRequestId(requestIdHeader) ?
        requestIdHeader
      : crypto.randomUUID();

    const requestIdSource: RequestIdSource =
      requestId === requestIdHeader ? "incoming" : "generated";

    return {
      requestId,
      requestIdSource,
    } satisfies RequestTraceEntity;
  }),
);

/**
 * Wraps a route so every log the handler emits is annotated with the request
 * trace. Applied as the innermost transform in the `route`/`pooledRoute`
 * helpers, purely for log correlation — it leaves the success and error channels
 * untouched and reads {@link RequestTrace} from the layer.
 */
export const RequestTraceMiddleware = <A, E, R>(next: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const trace = yield* RequestTrace;
    return yield* next.pipe(Effect.annotateLogs(trace));
  });

/**
 * Accepts request ids that are short and made only of URL-safe token characters,
 * so a hostile or malformed incoming header can never poison our logs.
 */
const isValidRequestId = (value: string) =>
  value.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(value);
