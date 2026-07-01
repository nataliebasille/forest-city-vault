import {
  PgColumnBuilderBase,
  PgTableWithColumns,
  PgTableExtraConfigValue,
  text,
  uuid,
  uniqueIndex,
  integer,
  primaryKey,
  index,
  timestamp,
} from "drizzle-orm/pg-core";
import { fcvTable } from "../+helpers";
import {
  BuildColumns,
  BuildExtraConfigColumns,
} from "drizzle-orm/column-builder";
import { inboxStatus } from "./status";

const inboxBaseColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: text("request_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: inboxStatus("status").notNull(),
  attempts: integer("attempts").notNull().default(0),

  // Time the event occurred (from the provider)
  occurredAt: timestamp("occurred_at"),
  // Time the event was received by our system
  receivedAt: timestamp("received_at").notNull(),
  // Time the event was processed by our system
  processedAt: timestamp("processed_at"),
};

type InboxBaseColumns = typeof inboxBaseColumns;

type InboxTable<
  TTableName extends string,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,
> = PgTableWithColumns<{
  name: TTableName;
  schema: undefined;
  columns: BuildColumns<TTableName, InboxBaseColumns & TColumnsMap, "pg">;
  dialect: "pg";
}>;

export type InboxErrorTable = ReturnType<
  typeof createInboxTables<"test", Record<string, PgColumnBuilderBase>>
>["errors"];

export const createInboxTables = <
  TTableName extends string,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,
>(
  name: TTableName,
  columns: TColumnsMap,
  options?: (
    self: BuildExtraConfigColumns<
      TTableName,
      InboxBaseColumns & TColumnsMap,
      "pg"
    >,
  ) => PgTableExtraConfigValue[],
) => {
  const mergedColumns: InboxBaseColumns & TColumnsMap = {
    ...inboxBaseColumns,
    ...columns,
  };

  const inboxTableName = `${name}_inbox` as const;
  const inbox: InboxTable<`${TTableName}_inbox`, TColumnsMap> = fcvTable(
    inboxTableName,
    mergedColumns,
    (table) => [
      uniqueIndex(`${inboxTableName}_idempotency_key_unique`).on(
        table.idempotencyKey,
      ),
      index(`${inboxTableName}_request_id_idx`).on(table.requestId),
      index(`${inboxTableName}_status_received_at_idx`).on(
        table.status,
        table.receivedAt,
      ),
      ...(options ? options(table) : []),
    ],
  );

  const errors = fcvTable(
    `${name}_inbox_errors`,
    {
      inboxId: uuid("inbox_id")
        .notNull()
        .references(() => inbox.id),
      attemptNumber: integer("attempt_number").notNull(),
      requestId: text("request_id").notNull(),
      error: text("error").notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.inboxId, table.attemptNumber] }),
      index(`${name}_inbox_errors_request_id_idx`).on(table.requestId),
    ],
  );

  return { inbox, errors };
};
