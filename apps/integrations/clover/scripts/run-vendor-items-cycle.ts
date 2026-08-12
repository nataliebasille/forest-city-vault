import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Load the canonical repo-root `.env` the same way `next.config.ts` does so a
// local run reads the exact same configuration as the app. In CI the variables
// are provided directly by the workflow, so a missing `.env` is not an error.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env"), override: false });

import { Cause, Effect, Exit } from "effect";
import { inspect } from "node:util";
import { runVendorItemsCycle } from "../lib/jobs/vendor-items";
import { JobLive } from "../lib/runtime/live";

/**
 * Standalone entrypoint that runs one full Clover vendor-items cycle — import
 * new/changed inventory items into the inbox, then drain the inbox onto their
 * vendors — directly against the database and Clover API, with no HTTP hop.
 *
 * This is what the `clover-process-vendor-items` GitHub Action executes on its
 * schedule: instead of `curl`ing a deployed processor endpoint, the runner checks
 * out the repo and runs the real code here. It reuses the same {@link JobLive}
 * layer and the same {@link runVendorItemsCycle} job the routes use.
 *
 * Configuration (env / repo-root `.env`):
 *   - DATABASE_URL              (required) Postgres connection string.
 *   - CLOVER_* config           (required) the same keys `CloverConfig` reads.
 *   - CLOVER_IMPORT_PAGE_SIZE   (optional) page size passed to the importer.
 *
 * Overlapping runs are prevented by the workflow's `concurrency` group, so no
 * in-process guard is needed here.
 */

const requestId = crypto.randomUUID();
const pageSize = parsePositiveInt(process.env.CLOVER_IMPORT_PAGE_SIZE);

const program = runVendorItemsCycle({ requestId, pageSize }).pipe(
  Effect.provide(JobLive),
);

const exit = await Effect.runPromiseExit(program);

if (Exit.isFailure(exit)) {
  console.error(
    `[vendor-items-cycle ${new Date().toISOString()}] cycle failed`,
  );
  // Readable stack view of the failure.
  console.error(Cause.pretty(exit.cause));
  // Wrapped errors (e.g. DatabaseError) hide the real driver error in their
  // `cause` field, which the pretty view omits. Deep-inspect the whole cause so
  // CI logs surface the underlying Postgres error (missing table, auth, SSL, …).
  console.error(inspect(exit.cause, { depth: 12, colors: false }));
  process.exit(1);
}

console.log(
  `[vendor-items-cycle ${new Date().toISOString()}] cycle completed (requestId ${requestId})`,
);

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}
