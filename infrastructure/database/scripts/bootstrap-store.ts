import { loadEnvFile } from "node:process";

try {
  loadEnvFile("../../.env");
} catch {}

import { Effect, Layer } from "effect";
import { DatabaseLive } from "../src/database";
import { runBootstrap } from "../src/bootstrap/runtime";
import { bootstrapStore } from "../src/bootstrap/bootstrap-store";

const program = runBootstrap(
  bootstrapStore(),
  DatabaseLive.pipe(Layer.orDie),
).pipe(
  Effect.tap((result) =>
    Effect.sync(() =>
      console.log(
        result.created ?
          `Created bootstrap store ${result.storeId}.`
        : `Bootstrap store ${result.storeId} already exists; nothing to do.`,
      ),
    ),
  ),
);

await Effect.runPromise(program);
