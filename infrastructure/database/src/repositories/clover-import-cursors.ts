import { Effect, Option } from "effect";
import { and, eq, sql } from "drizzle-orm";
import { Database } from "../database";
import { cloverImportCursors } from "../schema/clover-import-cursors";

export type CloverImportCursorRow = typeof cloverImportCursors.$inferSelect;
export type CloverImportCursorInsert = typeof cloverImportCursors.$inferInsert;

/**
 * Persistence for per-`(merchant, entity)` incremental-import watermarks.
 *
 * Like the other repositories, each method reads the {@link Database} at call
 * time, so it runs on the saga transaction inside a `withSaga` boundary and on
 * the base pooled connection otherwise, without the caller re-providing it.
 */
export const CloverImportCursorRepository = {
  /** Reads the watermark for a stream, or `None` when it has never run. */
  get: (merchantId: string, entityType: string) =>
    Effect.gen(function* () {
      const db = yield* Database;
      const rows = yield* db.query((sql) =>
        sql
          .select()
          .from(cloverImportCursors)
          .where(
            and(
              eq(cloverImportCursors.merchantId, merchantId),
              eq(cloverImportCursors.entityType, entityType),
            ),
          )
          .limit(1),
      );

      return Option.fromNullable(rows[0]);
    }),

  /**
   * Advances a stream's watermark to `lastTimestamp`.
   *
   * On conflict the stored watermark only ever moves forward
   * (`greatest(existing, incoming)`), so a late/out-of-order run can never rewind
   * the position past a newer one already recorded.
   */
  advance: (input: {
    readonly merchantId: string;
    readonly entityType: string;
    readonly lastTimestamp: number;
    readonly runAt: Date;
  }) =>
    Effect.gen(function* () {
      const db = yield* Database;
      yield* db.query((query) =>
        query
          .insert(cloverImportCursors)
          .values([
            {
              merchantId: input.merchantId,
              entityType: input.entityType,
              lastTimestamp: input.lastTimestamp,
              lastRunAt: input.runAt,
              createdAt: input.runAt,
              updatedAt: input.runAt,
            },
          ])
          .onConflictDoUpdate({
            target: [
              cloverImportCursors.merchantId,
              cloverImportCursors.entityType,
            ],
            set: {
              lastTimestamp: sql`greatest(${cloverImportCursors.lastTimestamp}, excluded.last_timestamp)`,
              lastRunAt: input.runAt,
              updatedAt: input.runAt,
            },
          }),
      );
    }),
} as const;
