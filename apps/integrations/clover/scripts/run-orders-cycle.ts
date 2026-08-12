import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";

// Load the canonical repo-root `.env` the same way `next.config.ts` does so a
// local run reads the exact same configuration as the app. In CI the variables
// are provided directly by the workflow, so a missing `.env` is not an error.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env"), override: false });

import { Cause, Effect, Exit } from "effect";
import { inspect } from "node:util";
import { runOrdersCycle } from "../lib/jobs/orders";
import { JobLive } from "../lib/runtime/live";

/**
 * Standalone entrypoint that runs one full Clover orders cycle — import
 * new/changed orders into the inbox, then drain the inbox into order snapshots —
 * directly against the
 * database and Clover API, with no HTTP hop.
 *
 * This is what the `clover-process-orders` GitHub Action executes on its
 * schedule: instead of `curl`ing a deployed processor endpoint, the runner checks
 * out the repo and runs the real code here. It reuses the same {@link JobLive}
 * layer and the same {@link runOrdersCycle} job the routes use.
 *
 * Configuration (env / repo-root `.env`):
 *   - DATABASE_URL              (required) Postgres connection string.
 *   - CLOVER_* config           (required) the same keys `CloverConfig` reads.
 *
 * Overlapping runs are prevented by the workflow's `concurrency` group, so no
 * in-process guard is needed here.
 */

const requestId = randomUUID();

const program = runOrdersCycle({ requestId }).pipe(Effect.provide(JobLive));

const exit = await Effect.runPromiseExit(program);

if (Exit.isFailure(exit)) {
  console.error(`[orders-cycle ${new Date().toISOString()}] cycle failed`);
  // Readable stack view of the failure.
  console.error(Cause.pretty(exit.cause));
  // Wrapped errors (e.g. DatabaseError) hide the real driver error in their
  // `cause` field, which the pretty view omits. Deep-inspect the whole cause so
  // CI logs surface the underlying Postgres error (missing table, auth, SSL, …).
  console.error(inspect(exit.cause, { depth: 12, colors: false }));
  process.exit(1);
}

console.log(
  `[orders-cycle ${new Date().toISOString()}] cycle completed (requestId ${requestId})`,
);
