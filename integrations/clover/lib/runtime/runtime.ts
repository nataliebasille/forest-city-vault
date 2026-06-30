import { defineRoute } from "@forest-city-vault/nextjs-core";
import { AppLive } from "./live";
import { RequestTraceMiddleware } from "./middleware/request-trace";
import { Effect } from "effect";
import { compose } from "effect/Function";

export const route = defineRoute(
  compose(Effect.provide(AppLive), RequestTraceMiddleware),
);
