import { CloverConfig } from "@forest-city-vault/config";
import { App } from "@forest-city-vault/nextjs-effect";
import { Layer } from "effect";
import { RequestTraceMiddleware } from "./middleware/request-trace";

const AppLive = Layer.mergeAll(CloverConfig.Default).pipe(Layer.orDie);

export const AppRoute = App.make(AppLive).use(RequestTraceMiddleware);
