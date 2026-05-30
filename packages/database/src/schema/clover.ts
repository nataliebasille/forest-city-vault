import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const eventStatus = pgEnum("event_status", [
  "received",
  "processed",
  "failed",
  "needs_review",
  "ignored",
  "dead_letter",
]);

export const cloverEventChangeType = pgEnum("clover_event_change_type", [
  "CREATE",
  "UPDATE",
  "DELETE",
]);

const cloverTable = pgTableCreator((name) => `clover_${name}`);

export const cloverEvents = cloverTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: text("request_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),

    appId: text("app_id").notNull(),
    merchantId: text("merchant_id").notNull(),

    eventType: text("event_type").notNull(),
    eventId: text("event_id").notNull(),
    eventTimestampMs: bigint("event_timestamp_ms", {
      mode: "number",
    }).notNull(),

    changeType: cloverEventChangeType("change_type").notNull(),

    receivedAt: timestamp("received_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    status: eventStatus("status").notNull().default("received"),

    payload: jsonb("payload").notNull(),
  },
  (table) => [
    uniqueIndex("clover_events_idempotency_key_unique").on(
      table.idempotencyKey,
    ),

    uniqueIndex("clover_events_natural_event_unique").on(
      table.appId,
      table.merchantId,
      table.eventType,
      table.eventId,
      table.changeType,
      table.eventTimestampMs,
    ),

    index("clover_events_merchant_object_idx").on(
      table.merchantId,
      table.eventType,
      table.eventId,
    ),
  ],
);

export const cloverEventProcessingAttempts = cloverTable(
  "event_processing_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: text("request_id").notNull(),
    cloverEventId: uuid("clover_event_id")
      .notNull()
      .references(() => cloverEvents.id, {
        onDelete: "cascade",
      }),

    attemptNumber: integer("attempt_number").notNull(),

    status: text("status").notNull(),

    startedAt: timestamp("started_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    finishedAt: timestamp("finished_at", {
      withTimezone: true,
    }),

    errorMessage: text("error_message"),

    metadata: jsonb("metadata"),
  },
  (table) => [
    uniqueIndex("clover_event_processing_attempts_event_attempt_unique").on(
      table.cloverEventId,
      table.attemptNumber,
    ),
  ],
);
