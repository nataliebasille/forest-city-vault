import { SqlError } from "@effect/sql/SqlError";
import { ConfigError, Context, Effect, Layer } from "effect";
import * as schema from "./schema";
import { PgRemoteDatabase } from "drizzle-orm/pg-proxy";
type SapphoDatabase = PgRemoteDatabase<typeof schema>;
export type DatabaseTransaction = SapphoDatabase;
declare const DatabaseError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "DatabaseError";
} & Readonly<A>;
export declare class DatabaseError extends DatabaseError_base<{
    message: string;
    cause: unknown;
}> {
}
export type DatabaseService = {
    readonly schema: typeof schema;
    readonly query: <A>(operation: (db: SapphoDatabase) => Promise<A>, options?: {
        readonly errorMessage?: string;
    }) => Effect.Effect<A, DatabaseError>;
    readonly transaction: <A>(operation: (tx: DatabaseTransaction) => Promise<A>, options?: {
        readonly errorMessage?: string;
    }) => Effect.Effect<A, DatabaseError>;
};
declare const Database_base: Context.TagClass<Database, "sappho/Database", DatabaseService>;
export declare class Database extends Database_base {
}
export declare const DatabaseLive: Layer.Layer<Database, SqlError | ConfigError.ConfigError, never>;
export { SupabaseConfig } from "@forest-city-vault/core-config";
export * as dbSchema from "./schema";
