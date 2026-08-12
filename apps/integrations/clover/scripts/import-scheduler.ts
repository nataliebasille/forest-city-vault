import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";

// Load the canonical repo-root `.env` the same way `next.config.ts` does, so the
// scheduler reads the exact same configuration as the app it shares code with.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env"), override: false });

import { ManagedRuntime } from "effect";
import { runOrdersCycle } from "../lib/jobs/orders";
import { JobLive } from "../lib/runtime/live";

/**
 * Local-only scheduler that drives the Clover order importer on an interval by
 * running the real import + drain code directly — no dev server, no HTTP hop. It
 * shares the exact {@link runOrdersCycle} job and {@link JobLive} layer
 * the routes and the GitHub Action runner use, so behaviour matches production.
 *
 * Each cycle runs, in order:
 *   1. import — list orders from Clover into the inbox.
 *   2. process — drain the inbox into order snapshots.
 *
 * The dependency layer (including the database pool) is built once via a
 * {@link ManagedRuntime} and reused for every cycle, then disposed on shutdown.
 *
 * Cycles never overlap: the next run is scheduled only after the current one
 * settles. A failed cycle is logged and the loop continues.
 *
 * Configuration (env / repo-root `.env`):
 *   - DATABASE_URL              (required) Postgres connection string.
 *   - CLOVER_* config           (required) the same keys `CloverConfig` reads.
 *   - CLOVER_IMPORT_INTERVAL_MS interval between cycle completions. Default 60000.
 */

const DEFAULT_INTERVAL_MS = 60_000;

const settings = readSettings();
const runtime = ManagedRuntime.make(JobLive);
let stopping = false;

main();

function main(): void {
  log(
    `starting importer scheduler → running code directly every ${Math.round(
      settings.intervalMs / 1000,
    )}s`,
  );

  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);

  void runLoop();
}

async function runLoop(): Promise<void> {
  while (!stopping) {
    await runCycle();
    if (stopping) {
      break;
    }
    await sleep(settings.intervalMs);
  }
  await runtime.dispose();
  log("scheduler stopped");
  process.exit(0);
}

async function runCycle(): Promise<void> {
  const requestId = randomUUID();
  try {
    await runtime.runPromise(runOrdersCycle({ requestId }));
    log(`cycle ok (requestId ${requestId})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`cycle FAILED (requestId ${requestId}): ${message}`);
  }
}

function requestStop(): void {
  if (stopping) {
    return;
  }
  stopping = true;
  log("stop requested — finishing current cycle then exiting");
}

function readSettings() {
  const intervalMs = parsePositiveInt(
    process.env.CLOVER_IMPORT_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
  );

  return { intervalMs };
}

function parsePositiveInt<T extends number | undefined>(
  raw: string | undefined,
  fallback: T,
): number | T {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  console.log(`[importer ${new Date().toISOString()}] ${message}`);
}
