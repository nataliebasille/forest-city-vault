import { mock } from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "@effect/platform";

import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { staticIdGenerator } from "@forest-city-vault/core-id-generator";
import {
  Database,
  DatabaseError,
  type DatabaseService,
  dbSchema,
} from "@forest-city-vault/infrastructure-database";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../../infrastructure/database/drizzle", import.meta.url),
);

export type TestDb = ReturnType<typeof drizzle>;

export interface MakeRouteTestOptions {
  appId?: string;
  webhookAuthCode?: string;
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
  const webhookAuthCode = options.webhookAuthCode ?? "test-auth-code";
  const fixedTime = options.fixedTime ?? new Date("2024-01-01T00:00:00Z");

  const client = new PGlite();
  const testDb = drizzle(client);
  const dbService: DatabaseService = {
    schema: dbSchema,
    query: (op, opts) =>
      Effect.tryPromise({
        try: () => op(testDb as never),
        catch: (cause) =>
          new DatabaseError({
            message: opts?.errorMessage ?? "Query failed",
            cause,
          }),
      }),
    transaction: (op, opts) =>
      Effect.tryPromise({
        try: () =>
          testDb.transaction((tx) =>
            Effect.runPromise(op(tx as never) as never),
          ),
        catch: (cause) =>
          new DatabaseError({
            message: opts?.errorMessage ?? "Transaction failed",
            cause,
          }),
      }),
  };

  const testLayer = Layer.mergeAll(
    Layer.succeed(Database, dbService),
    Layer.succeed(
      CloverConfig,
      CloverConfig.make({ appId, webhookAuthCode, url: "http://localhost" }),
    ),
    FetchHttpClient.layer,
    staticClock(fixedTime),
    staticIdGenerator("00000000-0000-7000-8000-000000000001"),
  );

  mock.module(new URL("../runtime/live.ts", import.meta.url).href, {
    namedExports: { AppLive: testLayer },
  });

  await migrate(testDb, { migrationsFolder: MIGRATIONS_FOLDER });

  const moduleExported = (await import(
    new URL(relativePath, callerImportMetaUrl).href
  )) as T;

  return {
    db: testDb,
    time: fixedTime,
    config: {
      clover: CloverConfig.make({
        appId,
        webhookAuthCode,
        url: "http://localhost",
      }),
    },
    module: moduleExported,
  };
}
