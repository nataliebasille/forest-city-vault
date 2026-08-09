import { processPayments } from "@/lib/jobs/payments";
import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { isAuthorizedInternalBearerToken } from "@/lib/security/internal-bearer-auth";
import { pooledRoute } from "@/runtime";
import {
  httpFailure,
  unauthorized,
} from "@forest-city-vault/platform-nextjs-effect";
import { Config, Effect, Redacted } from "effect";
import { NextRequest } from "next/server";

// Vercel Hobby caps serverless function duration at 60s. Keep the inbox drain
// within that budget; larger backlogs are processed across successive triggers.
export const maxDuration = 60;

const processPaymentsRoute = internalProcessorRoute(() =>
  Effect.gen(function* () {
    const { requestId } = yield* RequestTrace;
    yield* processPayments({ requestId });
    return true;
  }),
);

export const POST = pooledRoute(processPaymentsRoute as never);

const ACTIVE_GUARDS = new Set<string>();
const PROCESS_GUARD_KEY = "clover.process.payments";

export function internalProcessorRoute(
  handler: (request: NextRequest) => Effect.Effect<boolean, any, any>,
): (request: NextRequest) => Effect.Effect<boolean, any, any> {
  return (request: NextRequest) =>
    Effect.gen(function* () {
      const processorSecret = yield* Config.redacted("CLOVER_PROCESSOR_SECRET");

      const isAuthorized = isAuthorizedInternalBearerToken({
        authorizationHeader: request.headers.get("authorization"),
        expectedToken: Redacted.value(processorSecret),
      });

      if (!isAuthorized) {
        return yield* unauthorized("Unauthorized");
      }

      if (ACTIVE_GUARDS.has(PROCESS_GUARD_KEY)) {
        return yield* httpFailure(
          409,
          "Payment processing is already running",
        );
      }

      ACTIVE_GUARDS.add(PROCESS_GUARD_KEY);
      try {
        return yield* handler(request);
      } finally {
        ACTIVE_GUARDS.delete(PROCESS_GUARD_KEY);
      }
    });
}
