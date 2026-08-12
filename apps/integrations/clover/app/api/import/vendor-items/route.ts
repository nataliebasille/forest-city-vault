import { importVendorItems } from "@/lib/jobs/vendor-items";
import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { isAuthorizedInternalBearerToken } from "@/lib/security/internal-bearer-auth";
import { pooledRoute } from "@/runtime";
import { CloverConfig } from "@forest-city-vault/core-config";
import {
  httpFailure,
  unauthorized,
} from "@forest-city-vault/platform-nextjs-effect";
import { Effect, Redacted } from "effect";
import { NextRequest } from "next/server";

// Vercel Hobby caps serverless function duration at 60s. Keep the import within
// that budget; the engine fetches a single bounded page per run and resumes from
// its watermark on the next run.
export const maxDuration = 60;

/**
 * Internal, bearer-protected endpoint that incrementally pulls the configured
 * merchant's inventory items from the Clover API into the vendor-item inbox. The
 * incremental fetch, cursor handling, and idempotent enqueue live in the shared
 * {@link importVendorItems} job (reused by the scheduled runner); this route only
 * adds request auth and tracing.
 */
const importVendorItemsRoute = internalImportRoute(() =>
  Effect.gen(function* () {
    const { requestId } = yield* RequestTrace;

    yield* importVendorItems({ requestId });

    return true;
  }),
);

export const POST = pooledRoute(importVendorItemsRoute as never);

const ACTIVE_GUARDS = new Set<string>();
const IMPORT_GUARD_KEY = "clover.import.vendor-items";

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
        return yield* httpFailure(409, "Vendor item import is already running");
      }

      ACTIVE_GUARDS.add(IMPORT_GUARD_KEY);
      try {
        return yield* handler(request);
      } finally {
        ACTIVE_GUARDS.delete(IMPORT_GUARD_KEY);
      }
    });
}
