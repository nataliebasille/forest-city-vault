import { drizzle } from "drizzle-orm/pglite";
import { Effect, Layer } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "@effect/platform";

import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { staticIdGenerator } from "@forest-city-vault/core-id-generator";
import { RepositoriesLive } from "@forest-city-vault/infrastructure-database";
import { createTestDatabase } from "@forest-city-vault/infrastructure-database/testing";

import { SagaScopeLive } from "../runtime/live";

export type TestDb = ReturnType<typeof drizzle>;

export interface MakeCloverTestContextOptions {
  appId?: string;
  webhookAuthCode?: string;
  fixedTime?: Date;
  /**
   * Optional replacement for the outbound HTTP client. When omitted, the real
   * `FetchHttpClient.layer` is used (which is fine for routes that never make
   * outbound calls). Payment tests inject {@link cloverHttpClientMock} so they
   * can exercise the success/failure paths of `getCloverPayment` without a
   * real Clover API.
   */
  httpClient?: Layer.Layer<HttpClient.HttpClient>;
}

export interface CloverMockResponse {
  status?: number;
  body?: unknown;
}

/**
 * Builds a mock `HttpClient` layer that answers Clover payment lookups
 * (`GET /v3/merchants/{merchantId}/payments/{paymentId}`). The `handler`
 * receives the parsed ids and returns the canned response body (and optional
 * status). Returning a non-2xx status lets tests simulate upstream failures.
 */
export function cloverHttpClientMock(
  handler: (params: {
    merchantId: string;
    paymentId: string;
  }) => CloverMockResponse,
): Layer.Layer<HttpClient.HttpClient> {
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      const match = url.pathname.match(/merchants\/([^/]+)\/payments\/([^/]+)/);

      if (!match) {
        return HttpClientResponse.fromWeb(
          request,
          new Response("not found", { status: 404 }),
        );
      }

      const [, merchantId, paymentId] = match;
      const { status = 200, body } = handler({ merchantId, paymentId });

      return HttpClientResponse.fromWeb(
        request,
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );

  return Layer.succeed(HttpClient.HttpClient, client);
}

/**
 * Assembles the deterministic test dependencies for a Clover route: a shared
 * in-memory database (from infrastructure, so this app never re-implements
 * PGlite setup or migrations), the repositories, the same per-request saga scope
 * as production ({@link SagaScopeLive} — the `Saga` registry plus the
 * transaction-bound `Database`), a fixed clock/id-generator, and an optional
 * mocked HTTP client. This layer covers the exact service surface the route's
 * `AppLive` provides, so specs statically `import { POST } from "./route"` and
 * run it via `testRoute(POST, { layer })` — no module mocking required.
 *
 * The returned `reset()` empties every table (schema-agnostically) so a spec can
 * `beforeEach(reset)` for isolation without hand-listing tables.
 */
export async function makeCloverTestContext(
  options: MakeCloverTestContextOptions = {},
) {
  const appId = options.appId ?? "test-app-id";
  const webhookAuthCode = options.webhookAuthCode ?? "test-auth-code";
  const fixedTime = options.fixedTime ?? new Date("2024-01-01T00:00:00Z");

  const { db, layer: databaseLayer, reset } = await createTestDatabase();

  const cloverConfig = CloverConfig.make({
    appId,
    webhookAuthCode,
    url: "http://localhost",
  });

  const layer = Layer.mergeAll(
    RepositoriesLive,
    SagaScopeLive,
    Layer.succeed(CloverConfig, cloverConfig),
    options.httpClient ?? FetchHttpClient.layer,
    staticClock(fixedTime),
    staticIdGenerator("00000000-0000-7000-8000-000000000001"),
  ).pipe(Layer.provideMerge(databaseLayer));

  return {
    db,
    reset,
    layer,
    config: { clover: cloverConfig },
    time: fixedTime,
  };
}
