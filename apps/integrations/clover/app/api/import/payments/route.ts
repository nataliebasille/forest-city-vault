import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { paymentsImportSource, runImport } from "@/lib/import/public";
import { isAuthorizedInternalBearerToken } from "@/lib/security/internal-bearer-auth";
import { pooledRoute } from "@/runtime";
import { CloverConfig } from "@forest-city-vault/core-config";
import {
  httpFailure,
  unauthorized,
} from "@forest-city-vault/platform-nextjs-effect";
import { Effect, Redacted, Schema } from "effect";
import { NextRequest } from "next/server";

// Vercel Hobby caps serverless function duration at 60s. Keep the import within
// that budget; the engine pages a bounded number of records per run and resumes
// from its watermark on the next run.
export const maxDuration = 60;

// Default page size when the request body does not specify one.
const DEFAULT_PAGE_SIZE = 50;

const ImportPayloadSchema = Schema.Struct({
  pageSize: Schema.optional(Schema.Number),
});

const decodeImportPayload = Schema.decodeUnknown(
  Schema.parseJson(ImportPayloadSchema),
);

/**
 * Internal, bearer-protected endpoint that incrementally pulls the configured
 * merchant's payments from the Clover API into the payments inbox. It resolves
 * the merchant token via the static-token seam, resumes from a per-stream
 * watermark (so it never rescans from the beginning of time), and relies on the
 * existing `POST /api/process/payments` drain to turn inbox rows into sales.
 *
 * The incremental loop, cursor handling, and idempotent enqueue live in the
 * generic {@link runImport} engine; this route only supplies the payments source
 * and the merchant. Adding another entity (e.g. vendor items) is a new source,
 * not a new engine.
 */
const importPaymentsRoute = internalImportRoute((request) =>
  Effect.gen(function* () {
    const { requestId } = yield* RequestTrace;
    const { merchantId } = yield* CloverConfig;

    const { pageSize } = yield* readImportOptions(request);

    yield* runImport(paymentsImportSource, {
      merchantId,
      requestId,
      pageSize: pageSize ?? DEFAULT_PAGE_SIZE,
    });

    return true;
  }),
);

export const POST = pooledRoute(importPaymentsRoute as never);

function readImportOptions(request: NextRequest) {
  return Effect.gen(function* () {
    const raw = yield* Effect.promise(() => request.text());
    if (raw.trim() === "") {
      return {} as typeof ImportPayloadSchema.Type;
    }
    return yield* decodeImportPayload(raw);
  });
}

const ACTIVE_GUARDS = new Set<string>();
const IMPORT_GUARD_KEY = "clover.import.payments";

function internalImportRoute(
  handler: (request: NextRequest) => Effect.Effect<boolean, any, any>,
): (request: NextRequest) => Effect.Effect<boolean, any, any> {
  return (request: NextRequest) =>
    Effect.gen(function* () {
      const { processorSecret } = yield* CloverConfig;

      const isAuthorized = isAuthorizedInternalBearerToken({
        authorizationHeader: request.headers.get("authorization"),
        expectedToken: Redacted.value(processorSecret),
      });

      if (!isAuthorized) {
        return yield* unauthorized("Unauthorized");
      }

      if (ACTIVE_GUARDS.has(IMPORT_GUARD_KEY)) {
        return yield* httpFailure(409, "Payment import is already running");
      }

      ACTIVE_GUARDS.add(IMPORT_GUARD_KEY);
      try {
        return yield* handler(request);
      } finally {
        ACTIVE_GUARDS.delete(IMPORT_GUARD_KEY);
      }
    });
}
