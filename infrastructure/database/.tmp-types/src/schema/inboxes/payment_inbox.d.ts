export declare const paymentInbox: import("drizzle-orm/pg-core").PgTable<{
  name: "payment_inbox";
  schema: undefined;
  columns: {
    id: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "id";
        tableName: "payment_inbox";
        dataType: "string";
        columnType: "PgUUID";
        data: string;
        driverParam: string;
        notNull: true;
        hasDefault: true;
        isPrimaryKey: true;
        isAutoincrement: false;
        hasRuntimeDefault: false;
        enumValues: undefined;
        baseColumn: never;
        identity: undefined;
        generated: undefined;
      },
      {},
      {}
    >;
    requestId: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "request_id";
        tableName: "payment_inbox";
        dataType: "string";
        columnType: "PgText";
        data: string;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
        isAutoincrement: false;
        hasRuntimeDefault: false;
        enumValues: [string, ...string[]];
        baseColumn: never;
        identity: undefined;
        generated: undefined;
      },
      {},
      {}
    >;
    idempotencyKey: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "idempotency_key";
        tableName: "payment_inbox";
        dataType: "string";
        columnType: "PgText";
        data: string;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
        isAutoincrement: false;
        hasRuntimeDefault: false;
        enumValues: [string, ...string[]];
        baseColumn: never;
        identity: undefined;
        generated: undefined;
      },
      {},
      {}
    >;
    name: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "name";
        tableName: "payment_inbox";
        dataType: "string";
        columnType: "PgText";
        data: string;
        driverParam: string;
        notNull: false;
        hasDefault: false;
        isPrimaryKey: false;
        isAutoincrement: false;
        hasRuntimeDefault: false;
        enumValues: [string, ...string[]];
        baseColumn: never;
        identity: undefined;
        generated: undefined;
      },
      {},
      {}
    >;
  };
  dialect: "pg";
}> & {
  id: import("drizzle-orm/pg-core").PgColumn<
    {
      name: "id";
      tableName: "payment_inbox";
      dataType: "string";
      columnType: "PgUUID";
      data: string;
      driverParam: string;
      notNull: true;
      hasDefault: true;
      isPrimaryKey: true;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: undefined;
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    },
    {},
    {}
  >;
  requestId: import("drizzle-orm/pg-core").PgColumn<
    {
      name: "request_id";
      tableName: "payment_inbox";
      dataType: "string";
      columnType: "PgText";
      data: string;
      driverParam: string;
      notNull: true;
      hasDefault: false;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: [string, ...string[]];
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    },
    {},
    {}
  >;
  idempotencyKey: import("drizzle-orm/pg-core").PgColumn<
    {
      name: "idempotency_key";
      tableName: "payment_inbox";
      dataType: "string";
      columnType: "PgText";
      data: string;
      driverParam: string;
      notNull: true;
      hasDefault: false;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: [string, ...string[]];
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    },
    {},
    {}
  >;
  name: import("drizzle-orm/pg-core").PgColumn<
    {
      name: "name";
      tableName: "payment_inbox";
      dataType: "string";
      columnType: "PgText";
      data: string;
      driverParam: string;
      notNull: false;
      hasDefault: false;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: [string, ...string[]];
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    },
    {},
    {}
  >;
} & {
  enableRLS: () => Omit<
    import("drizzle-orm/pg-core").PgTableWithColumns<{
      name: "payment_inbox";
      schema: undefined;
      columns: {
        id: import("drizzle-orm/pg-core").PgColumn<
          {
            name: "id";
            tableName: "payment_inbox";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
        requestId: import("drizzle-orm/pg-core").PgColumn<
          {
            name: "request_id";
            tableName: "payment_inbox";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
        idempotencyKey: import("drizzle-orm/pg-core").PgColumn<
          {
            name: "idempotency_key";
            tableName: "payment_inbox";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
        name: import("drizzle-orm/pg-core").PgColumn<
          {
            name: "name";
            tableName: "payment_inbox";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
      };
      dialect: "pg";
    }>,
    "enableRLS"
  >;
};
