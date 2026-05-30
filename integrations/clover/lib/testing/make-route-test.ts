import { mock } from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Effect, Layer } from "effect";

import { staticClock } from "@forest-city-vault/clock";
import { CloverConfig } from "@forest-city-vault/config";
import {
  Database,
  DatabaseError,
  type DatabaseService,
  dbSchema,
} from "@forest-city-vault/database";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../../packages/database/drizzle", import.meta.url),
);

export type TestDb = ReturnType<typeof drizzle<typeof dbSchema>>;

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
  const testDb = drizzle(client, { schema: dbSchema });
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
        try: () => testDb.transaction((tx) => op(tx as never)),
        catch: (cause) =>
          new DatabaseError({
            message: opts?.errorMessage ?? "Transaction failed",
            cause,
          }),
      }),
  };

  const testLayer = Layer.mergeAll(
    Layer.succeed(Database, dbService),
    Layer.succeed(CloverConfig, CloverConfig.make({ appId, webhookAuthCode })),
    staticClock(fixedTime),
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
    config: { clover: CloverConfig.make({ appId, webhookAuthCode }) },
    module: moduleExported,
  };
}
