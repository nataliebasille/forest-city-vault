import { SystemClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { DatabaseLive } from "@forest-city-vault/database";
import { Layer } from "effect";

export const AppLive = Layer.mergeAll(
  CloverConfig.Default,
  DatabaseLive,
  SystemClock,
).pipe(Layer.orDie);
