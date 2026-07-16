import { mock } from "node:test";

import { drizzle } from "drizzle-orm/pglite";
import { Layer, Redacted } from "effect";
import { FetchHttpClient } from "@effect/platform";

import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { staticIdGenerator } from "@forest-city-vault/core-id-generator";
import { databaseSagaScoped } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";

export type TestDb = ReturnType<typeof drizzle>;

export interface MakeRouteTestOptions {
  appId?: string;
  secretCode?: string;
  webhookAuthCode?: string;
  tokenEncryptionKey?: string;
  fixedTime?: Date;
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
  const tokenEncryptionKey =
    options.tokenEncryptionKey ?? "test-token-encryption-key";
  const fixedTime = options.fixedTime ?? new Date("2024-01-01T00:00:00Z");

  const { layer: databaseLayer, db: testDb } = await makeDatabaseTestContext();

  const cloverConfig = CloverConfig.make({
    appId,
    secretCode,
    webhookAuthCode,
    url: "http://localhost",
    tokenEncryptionKey: Redacted.make(tokenEncryptionKey),
  });

  const commonLayer = Layer.mergeAll(
    Layer.succeed(CloverConfig, cloverConfig),
    FetchHttpClient.layer,
    staticClock(fixedTime),
    staticIdGenerator("00000000-0000-7000-8000-000000000001"),
  );

  // Mirror the production `live.ts` compositions over the same test database:
  // `AppLive` provides the saga-scoped (transactional) Database, `AppLivePooled`
  // provides the base pool Database. Both back onto the same PGlite instance, so
  // the returned `db` handle observes whichever the route under test uses.
  const testLayer = Layer.merge(
    commonLayer,
    databaseSagaScoped.pipe(Layer.provide(databaseLayer)),
  );

  const testLayerPooled = Layer.merge(commonLayer, databaseLayer);

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

