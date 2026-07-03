import { id, createdAt, fcvTable } from "./+helpers";
import { index, integer, jsonb, text, uniqueIndex } from "drizzle-orm/pg-core";

export const aggregateEvents = fcvTable(
  "aggregate_events",
  {
    id: id(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    version: integer("version").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    createdAt,
  },
  (table) => [
    index("aggregate_events_stream_idx").on(table.aggregateType, table.aggregateId),
    uniqueIndex("aggregate_events_stream_version_uidx").on(
      table.aggregateType,
      table.aggregateId,
      table.version,
    ),
  ],
);
