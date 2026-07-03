import {
  EventStorePersistence,
  UnknownEventStoreError,
  type PersistedEvent,
} from "@forest-city-vault/core-domain";
import { and, asc, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { Database } from "./database";
import { aggregateEvents } from "./schema/event-store";

/**
 * Database adapter for the event store persistence port. It only knows *how*
 * events are durably stored and retrieved — the buffering, versioning and
 * concurrency logic lives in the domain (`EventStore.make`).
 */
export const EventStorePersistenceLive = Layer.effect(
  EventStorePersistence,
  Effect.gen(function* () {
    const db = yield* Database;

    return {
      persist: (events) =>
        Effect.gen(function* () {
          if (events.length === 0) {
            return;
          }

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

      read: (aggregateType, aggregateId) =>
        db
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
          ),
    } satisfies EventStorePersistence.Service;
  }),
);
