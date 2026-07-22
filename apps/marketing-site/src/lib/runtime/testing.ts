import {
  Body,
  Cookies,
  Headers,
} from "@forest-city-vault/platform-nextjs-effect";
import { Layer } from "effect";
import { RequestTrace, type RequestTraceEntity } from "./request-trace";

/**
 * A fixed {@link RequestTrace} layer for tests — the marketing-site analog of
 * `staticClock`. The production trace is derived from request headers via
 * `crypto.randomUUID()`; tests provide a deterministic value instead so log
 * correlation never depends on randomness. Override individual fields as needed.
 */
export function staticRequestTrace(
  overrides?: Partial<RequestTraceEntity>,
): Layer.Layer<RequestTrace> {
  return Layer.succeed(RequestTrace, {
    requestId: overrides?.requestId ?? "test-request-id",
    requestIdSource: overrides?.requestIdSource ?? "generated",
  });
}

/**
 * A stand-in for the `next/headers`-backed request state, which is unavailable
 * outside a real Next.js request. Provides `Headers` (seeded from `headers`),
 * plus empty `Cookies` and `Body`, so `testServerAction` can run an action's
 * pipeline without the Next runtime. Reusable across marketing-site action tests.
 */
export function testRequestState(headers: Record<string, string> = {}) {
  return Layer.mergeAll(
    Layer.succeed(Headers, new globalThis.Headers(headers) as never),
    Layer.succeed(Cookies, {
      get: () => undefined,
      getAll: () => [],
      has: () => false,
      toString: () => "",
    } as never),
    Layer.succeed(Body, undefined),
  );
}
