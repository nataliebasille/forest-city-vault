import { loadEnvFile } from "node:process";

try {
  loadEnvFile("../../.env");
} catch {}

import { Effect, Layer } from "effect";
import { DatabaseLive } from "../src/database";
import { runBootstrap } from "../src/bootstrap/runtime";
import { seedOrders } from "../src/seed/seed-orders";

const program = runBootstrap(seedOrders(), DatabaseLive.pipe(Layer.orDie)).pipe(
  Effect.tap((result) =>
    Effect.sync(() =>
      console.log(
        `Seeded ${result.seeded} demo orders (${result.orderIds.join(", ")}).`,
      ),
    ),
  ),
);

await Effect.runPromise(program);
