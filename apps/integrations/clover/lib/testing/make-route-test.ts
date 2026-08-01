import { mock } from "node:test";

import { drizzle } from "drizzle-orm/pglite";
import { Effect, Layer, Redacted } from "effect";
import { FetchHttpClient } from "@effect/platform";

import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { staticIdGenerator } from "@forest-city-vault/core-id-generator";
import { databaseSagaScoped } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";

import { RequestTraceLayer } from "../runtime/middleware/request-trace";

export type TestDb = ReturnType<typeof drizzle>;

export interface MakeRouteTestOptions {
  appId?: string;
  secretCode?: string;
  webhookAuthCode?: string;
  processorSecret?: string;
  url?: string;
  oauthUrl?: string;
  tokenEncryptionKey?: string;
  merchantId?: string;
  oauthRedirectUri?: string;
  oauthStateSecret?: string;
  fixedTime?: Date;
  onPooledRuntimeAcquire?: () => void;
}

type Testing<T> = {
  db: TestDb;
  time: Date;
  config: {
    clover: CloverConfig;
  };
  module: T;
};

export async function makeRouteTest<T>(
  callerImportMetaUrl: string,
  relativePath: string,
  options: MakeRouteTestOptions = {},
): Promise<Testing<T>> {
  const appId = options.appId ?? "test-app-id";
  const secretCode = options.secretCode ?? "test-app-secret";
  const webhookAuthCode = options.webhookAuthCode ?? "test-auth-code";
  const processorSecret = options.processorSecret ?? "test-processor-secret";
  const url = options.url ?? "http://localhost";
  const oauthUrl = options.oauthUrl ?? "http://oauth.localhost";
  const tokenEncryptionKey =
    options.tokenEncryptionKey ?? "test-token-encryption-key";
  const merchantId = options.merchantId ?? "test-merchant-id";
  const oauthRedirectUri =
    options.oauthRedirectUri ?? "http://localhost/api/oauth/callback";
  const oauthStateSecret =
    options.oauthStateSecret ?? "test-oauth-state-secret";
  const fixedTime = options.fixedTime ?? new Date("2024-01-01T00:00:00Z");

  const { layer: databaseLayer, db: testDb } = await makeDatabaseTestContext();

  const cloverConfig = CloverConfig.make({
    appId,
    secretCode,
    webhookAuthCode,
    processorSecret: Redacted.make(processorSecret),
    url,
    oauthUrl,
    tokenEncryptionKey: Redacted.make(tokenEncryptionKey),
    merchantId,
    oauthRedirectUri,
    oauthStateSecret: Redacted.make(oauthStateSecret),
  });

  const commonLayer = Layer.mergeAll(
    Layer.succeed(CloverConfig, cloverConfig),
    FetchHttpClient.layer,
    staticClock(fixedTime),
    staticIdGenerator("00000000-0000-7000-8000-000000000001"),
    RequestTraceLayer,
  );

  // Mirror the production `live.ts` compositions over the same test database:
  // `AppLive` provides the saga-scoped (transactional) Database via
  // `provideSagaScoped` (rebuilt per request by the `route` helper's `withSaga`),
  // `AppLivePooled` provides the base pool Database. Both back onto the same
  // PGlite instance, so the returned `db` handle observes whichever the route
  // under test uses.
  const testLayer = Layer.mergeAll(
    commonLayer,
    databaseLayer,
    provideSagaScoped(databaseSagaScoped),
  );

  const pooledAcquireProbe = Layer.effectDiscard(
    Effect.sync(() => {
      options.onPooledRuntimeAcquire?.();
    }),
  );

  const testLayerPooled = Layer.mergeAll(
    commonLayer,
    databaseLayer,
    pooledAcquireProbe,
  );

  mock.module(new URL("../runtime/live.ts", import.meta.url).href, {
    namedExports: { AppLive: testLayer, AppLivePooled: testLayerPooled },
  });

  const moduleExported = (await import(
    new URL(relativePath, callerImportMetaUrl).href
  )) as T;

  return {
    db: testDb,
    time: fixedTime,
    config: {
      clover: cloverConfig,
    },
    module: moduleExported,
  };
}
