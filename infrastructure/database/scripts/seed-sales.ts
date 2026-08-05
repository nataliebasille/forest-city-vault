import { loadEnvFile } from "node:process";

try {
  loadEnvFile("../../.env");
} catch {}

import { Effect, Layer } from "effect";
import { DatabaseLive } from "../src/database";
import { runBootstrap } from "../src/bootstrap/runtime";
import { seedSales } from "../src/seed/seed-sales";

const program = runBootstrap(seedSales(), DatabaseLive.pipe(Layer.orDie)).pipe(
  Effect.tap((result) =>
    Effect.sync(() =>
      console.log(
        `Seeded ${result.seeded} demo sales (${result.saleIds.join(", ")}).`,
      ),
    ),
  ),
);

await Effect.runPromise(program);
