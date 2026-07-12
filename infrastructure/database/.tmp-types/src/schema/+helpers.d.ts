export declare const fcvTable: import("drizzle-orm/pg-core").PgTableFn<undefined>;
export declare const id: (
  name?: string,
) => import("drizzle-orm").HasRuntimeDefault<
  import("drizzle-orm").HasDefault<
    import("drizzle-orm").IsPrimaryKey<
      import("drizzle-orm").NotNull<
        import("drizzle-orm/pg-core").PgUUIDBuilderInitial<string>
      >
    >
  >
>;
export declare const createdAt: import("drizzle-orm").NotNull<
  import("drizzle-orm/pg-core").PgTimestampBuilderInitial<"created_at">
>;
export declare const updatedAt: import("drizzle-orm").NotNull<
  import("drizzle-orm/pg-core").PgTimestampBuilderInitial<"updated_at">
>;
export declare const cents: (
  name: string,
) => import("drizzle-orm/pg-core").PgBigInt64BuilderInitial<string>;
