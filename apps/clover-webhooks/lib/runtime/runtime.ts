import { Next } from "@mcrovero/effect-nextjs";
import { Effect, Layer } from "effect";
import {
  RouteErrorMiddleware,
  RouteErrorMiddlewareLive,
} from "./middleware/error-handling-middleware";
import {
  JsonResponseMiddleware,
  JsonResponseMiddlewareLive,
} from "./middleware/json-response-middleware";
import {
  RequestId,
  RequestIdLive,
  RequestIdMiddleware,
} from "./middleware/request-id-middleware";

const AppLive = Layer.mergeAll(
  RequestIdLive,
  RouteErrorMiddlewareLive,
  JsonResponseMiddlewareLive,
);

export const AppRoute = Next.make("api", AppLive)
  .middleware(RequestIdMiddleware)
  .middleware(RouteErrorMiddleware)
  .middleware(JsonResponseMiddleware)
  .pipe(() =>
    Effect.gen(function* () {
      const requestId = yield* RequestId;

      return Effect.annotateLogs(requestId);
    }),
  );
