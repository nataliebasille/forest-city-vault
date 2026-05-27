import { App } from "@forest-city-vault/nextjs-effect";
import { Layer } from "effect";
import { RequestTraceMiddleware } from "./middleware/request-trace";

// const AppLive = Layer.mergeAll(
//   // RequestIdLive,
//   RouteErrorMiddlewareLive,
//   JsonResponseMiddlewareLive,
// );

export const AppRoute = App.make(Layer.empty).use(RequestTraceMiddleware);
