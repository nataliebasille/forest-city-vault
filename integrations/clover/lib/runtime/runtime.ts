import { FetchHttpClient } from "@effect/platform";
import { SystemClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { SystemIdGenerator } from "@forest-city-vault/core-id-generator";
import {
  DatabaseLive,
  RepositoriesLive,
} from "@forest-city-vault/infrastructure-database";
import { defineRoute } from "@forest-city-vault/nextjs-core";
import { Effect, Layer } from "effect";
import { compose } from "effect/Function";
import { RequestTraceMiddleware } from "./middleware/request-trace";

export const AppLive = Layer.mergeAll(
  CloverConfig.Default,
  DatabaseLive,
  SystemClock,
  SystemIdGenerator,
  FetchHttpClient.layer,
  RepositoriesLive,
).pipe(Layer.orDie);

export const route = defineRoute(
  compose(Effect.provide(AppLive), RequestTraceMiddleware),
);
