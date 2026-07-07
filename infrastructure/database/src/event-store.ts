import {
  EventStorePersistence,
  UnknownEventStoreError,
  type PersistedEvent,
} from "@forest-city-vault/core-domain";
import { and, asc, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { Database } from "./database";
import { aggregateEvents } from "./schema/event-store";
import { onAmbientDatabase } from "./utils/on-ambient-database";

/**
 * Database adapter for the event store persistence port. It only knows *how*
 * events are durably stored and retrieved — the buffering, versioning and
 * concurrency logic lives in the domain (`EventStore.make`).
 *
 * Each method reads `Database` at call time (via `onAmbientDatabase`) rather than
 * capturing it when this layer is built, so appends and reads run on whatever
 * `Database` is ambient — the base connection normally, or the saga's
 * transaction-bound `Database` inside a `withSaga` boundary — and therefore
 * commit or roll back together with everything else in the saga.
 */
export const EventStorePersistenceLive = Layer.succeed(EventStorePersistence, {
  persist: (events) =>
    onAmbientDatabase(
      Effect.gen(function* () {
        if (events.length === 0) {
          return;
        }

        const db = yield* Database;
        const now = new Date();

        yield* db
          .query(
            (sql) =>
              sql.insert(aggregateEvents).values(
                events.map((event) => ({
                  aggregateType: event.aggregateType,
                  aggregateId: event.aggregateId,
                  version: event.version,
                  eventType: event.type,
                  payload: event.payload,
                  createdAt: now,
                })),
              ),
            {
              errorMessage: "Failed to save aggregate events",
            },
          )
          .pipe(
            Effect.mapError(
              (error) =>
                new UnknownEventStoreError({
                  aggType: events[0].aggregateType,
                  aggId: events[0].aggregateId,
                  error,
                }),
            ),
          );
      }),
    ),

  read: (aggregateType, aggregateId) =>
    onAmbientDatabase(
      Effect.gen(function* () {
        const db = yield* Database;

        return yield* db
          .query(
            (sql) =>
              sql
                .select({
                  version: aggregateEvents.version,
                  type: aggregateEvents.eventType,
                  payload: aggregateEvents.payload,
                })
                .from(aggregateEvents)
                .where(
                  and(
                    eq(aggregateEvents.aggregateType, aggregateType),
                    eq(aggregateEvents.aggregateId, aggregateId),
                  ),
                )
                .orderBy(asc(aggregateEvents.version)),
            {
              errorMessage: "Failed to read aggregate events",
            },
          )
          .pipe(
            Effect.map((rows) =>
              rows.map(
                (row) =>
                  ({
                    aggregateType,
                    aggregateId,
                    version: row.version,
                    type: row.type,
                    payload: row.payload,
                  }) satisfies PersistedEvent,
              ),
            ),
            Effect.mapError(
              (error) =>
                new UnknownEventStoreError({
                  aggType: aggregateType,
                  aggId: aggregateId,
                  error,
                }),
            ),
          );
      }),
    ),
} satisfies EventStorePersistence.Service);
