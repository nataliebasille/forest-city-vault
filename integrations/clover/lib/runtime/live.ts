import { FetchHttpClient } from "@effect/platform";
import { SystemClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { SystemIdGenerator } from "@forest-city-vault/core-id-generator";
import { DatabaseLive } from "@forest-city-vault/infrastructure-database";
import { Layer } from "effect";

export const AppLive = Layer.mergeAll(
  CloverConfig.Default,
  DatabaseLive,
  SystemClock,
  SystemIdGenerator,
  FetchHttpClient.layer,
).pipe(Layer.orDie);
