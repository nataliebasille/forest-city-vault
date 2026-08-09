import { importPayments } from "@/lib/jobs/payments";
import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
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

const ImportPayloadSchema = Schema.Struct({
  pageSize: Schema.optional(Schema.Number),
});

const decodeImportPayload = Schema.decodeUnknown(
  Schema.parseJson(ImportPayloadSchema),
);

/**
 * Internal, bearer-protected endpoint that incrementally pulls the configured
 * merchant's payments from the Clover API into the payments inbox. The actual
 * incremental loop, cursor handling, and idempotent enqueue live in the shared
 * {@link importPayments} job (reused by the scheduled runner); this route only
 * adds request auth, tracing, and the optional page-size override.
 */
const importPaymentsRoute = internalImportRoute((request) =>
  Effect.gen(function* () {
    const { requestId } = yield* RequestTrace;
    const { pageSize } = yield* readImportOptions(request);

    yield* importPayments({ requestId, pageSize });

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
