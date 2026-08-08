import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Load the canonical repo-root `.env` the same way `next.config.ts` does, so the
// scheduler and the dev server it drives read the exact same configuration.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env"), override: false });

/**
 * Local-only scheduler that drives the Clover payment importer on an interval.
 *
 * It assumes the Clover integration dev server is already running separately
 * (`pnpm dev`, port 3103 by default). Each cycle it calls, in order:
 *   1. `POST /api/import/payments`  — list payments from Clover into the inbox.
 *   2. `POST /api/process/payments` — drain the inbox into sales.
 * Both are internal endpoints authenticated with `CLOVER_PROCESSOR_SECRET`.
 *
 * Cycles never overlap: the next run is scheduled only after the current one
 * settles. A failed request is logged and the loop continues.
 *
 * Configuration (env / repo-root `.env`):
 *   - CLOVER_PROCESSOR_SECRET   (required) bearer secret for both endpoints.
 *   - CLOVER_IMPORT_BASE_URL    base URL of the dev server. Default http://localhost:3103.
 *   - CLOVER_IMPORT_INTERVAL_MS interval between cycle starts' completions. Default 60000.
 *   - CLOVER_IMPORT_LIMIT       optional page size passed to the import endpoint.
 *   - CLOVER_IMPORT_FILTER      optional Clover query filter, e.g. createdTime>=1700000000000.
 */

const DEFAULT_BASE_URL = "http://localhost:3103";
const DEFAULT_INTERVAL_MS = 60_000;

const settings = readSettings();
let stopping = false;

main();

function main(): void {
  log(
    `starting importer scheduler → ${settings.baseUrl} every ${Math.round(
      settings.intervalMs / 1000,
    )}s (import limit: ${settings.limit ?? "default"}, filter: ${
      settings.filter ?? "none"
    })`,
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
  log("scheduler stopped");
  process.exit(0);
}

async function runCycle(): Promise<void> {
  const importBody: Record<string, unknown> = {};
  if (settings.limit !== undefined) {
    importBody.limit = settings.limit;
  }
  if (settings.filter !== undefined) {
    importBody.filter = settings.filter;
  }

  await callEndpoint(
    "import",
    "/api/import/payments",
    Object.keys(importBody).length > 0 ? JSON.stringify(importBody) : undefined,
  );

  if (stopping) {
    return;
  }

  await callEndpoint("process", "/api/process/payments", undefined);
}

async function callEndpoint(
  label: string,
  route: string,
  body: string | undefined,
): Promise<void> {
  const url = `${settings.baseUrl}${route}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.processorSecret}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
    });

    const text = await response.text();
    const summary = text.length > 300 ? `${text.slice(0, 300)}…` : text;
    if (response.ok) {
      log(`${label} ok (${response.status}) ${summary}`);
    } else {
      log(`${label} FAILED (${response.status}) ${summary}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      `${label} ERROR calling ${url}: ${message} (is the dev server running?)`,
    );
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
  const processorSecret = process.env.CLOVER_PROCESSOR_SECRET;
  if (!processorSecret) {
    console.error(
      "[importer] CLOVER_PROCESSOR_SECRET is not set. Add it to the repo-root .env.",
    );
    process.exit(1);
  }

  const baseUrl = (
    process.env.CLOVER_IMPORT_BASE_URL ?? DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  const intervalMs = parsePositiveInt(
    process.env.CLOVER_IMPORT_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
  );

  const limit = parsePositiveInt(process.env.CLOVER_IMPORT_LIMIT, undefined);
  const filter = process.env.CLOVER_IMPORT_FILTER || undefined;

  return { processorSecret, baseUrl, intervalMs, limit, filter };
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
