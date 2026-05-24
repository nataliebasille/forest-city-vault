// runtime/response-middleware.ts
import { NextMiddleware } from "@mcrovero/effect-nextjs";
import * as RequestState from "@mcrovero/effect-nextjs/Headers";
import { Context, Effect, Layer, Schema } from "effect";
import { RequestTrace } from "../http/request-trace";

export class RequestTraceMiddleware extends NextMiddleware.Tag<RequestTraceMiddleware>()(
  "RequestTraceMiddleware",
  { wrap: true, provides: RequestTrace, failure: Schema.Never },
) {}

export const RequestTraceLive = Layer.succeed(
  RequestTraceMiddleware,
  RequestTraceMiddleware.of(({ next, props }) =>
    Effect.gen(function* () {
      const trace = RequestTrace.fromRequest(request);

      return yield* next.pipe(
        Effect.provideService(RequestTrace, trace),
        Effect.annotateLogs(trace),
      );
    }),
  ),
);
