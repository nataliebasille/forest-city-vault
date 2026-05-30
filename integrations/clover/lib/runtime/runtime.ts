import { App } from "@forest-city-vault/nextjs-effect";
import { AppLive } from "./live";
import { NonHttpTo500Middleware } from "./middleware/non-http-to-500-middleware";
import { RequestTraceMiddleware } from "./middleware/request-trace";

export const AppRoute = App.make(AppLive)
  .use(RequestTraceMiddleware)
  .use(NonHttpTo500Middleware);
