import { Headers } from "@forest-city-vault/platform-nextjs-effect";
import { Context, Effect } from "effect";

export const REQUEST_ID_HEADER = "x-request-id";

type RequestIdSource = "generated" | "incoming";

export type RequestTraceEntity = {
  requestId: string;
  requestIdSource: RequestIdSource;
  // method: string;
  // url: string;
};

const isValidRequestId = (value: string) =>
  value.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(value);

export class RequestTrace extends Context.Tag("clover-webhooks/request-trace")<
  RequestTrace,
  RequestTraceEntity
>() {}

export const RequestTraceMiddleware = <A, E, R>(next: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const headers = yield* Headers;
    const requestIdHeader = headers.get(REQUEST_ID_HEADER);

    const requestId =
      typeof requestIdHeader === "string" && isValidRequestId(requestIdHeader) ?
        requestIdHeader
      : crypto.randomUUID();

    const requestIdSource: RequestIdSource =
      requestId === requestIdHeader ? "incoming" : "generated";

    const trace: RequestTraceEntity = {
      requestId,
      requestIdSource,
    };

    return yield* next.pipe(
      Effect.provideService(RequestTrace, trace),
      Effect.annotateLogs(trace),
    );
  });
