import { Next } from "@mcrovero/effect-nextjs";
import { Layer } from "effect";
import {
  RouteErrorMiddleware,
  RouteErrorMiddlewareLive,
} from "./middleware/error-handling-middleware";
import {
  JsonResponseMiddleware,
  JsonResponseMiddlewareLive,
} from "./middleware/json-response-middleware";

const AppLive = Layer.mergeAll(
  RouteErrorMiddlewareLive,
  JsonResponseMiddlewareLive,
);

export const AppRoute = Next.make("clover-webhooks/routes", AppLive)
  .middleware(RouteErrorMiddleware)
  .middleware(JsonResponseMiddleware);
