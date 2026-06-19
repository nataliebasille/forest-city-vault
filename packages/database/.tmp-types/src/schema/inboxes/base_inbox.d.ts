import { PgColumnBuilderBase, PgTableWithColumns, PgTableExtraConfigValue } from "drizzle-orm/pg-core";
import { BuildColumns, BuildExtraConfigColumns } from "drizzle-orm/column-builder";
declare const inboxBaseColumns: {
    id: import("drizzle-orm").HasDefault<import("drizzle-orm").IsPrimaryKey<import("drizzle-orm").NotNull<import("drizzle-orm/pg-core").PgUUIDBuilderInitial<"id">>>>;
    requestId: import("drizzle-orm").NotNull<import("drizzle-orm/pg-core").PgTextBuilderInitial<"request_id", [string, ...string[]]>>;
    idempotencyKey: import("drizzle-orm").NotNull<import("drizzle-orm/pg-core").PgTextBuilderInitial<"idempotency_key", [string, ...string[]]>>;
};
type InboxBaseColumns = typeof inboxBaseColumns;
type InboxTable<TTableName extends string, TColumnsMap extends Record<string, PgColumnBuilderBase>> = PgTableWithColumns<{
    name: TTableName;
    schema: undefined;
    columns: BuildColumns<TTableName, InboxBaseColumns & TColumnsMap, "pg">;
    dialect: "pg";
}>;
export declare const createInboxTable: <TTableName extends string, TColumnsMap extends Record<string, PgColumnBuilderBase>>(name: TTableName, columns: TColumnsMap, options?: (self: BuildExtraConfigColumns<TTableName, InboxBaseColumns & TColumnsMap, "pg">) => PgTableExtraConfigValue[]) => InboxTable<TTableName, TColumnsMap>;
export {};
