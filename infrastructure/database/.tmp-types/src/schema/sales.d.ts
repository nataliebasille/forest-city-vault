export declare const salesSource: import("drizzle-orm/pg-core").PgEnum<
  ["clover"]
>;
export declare const salesTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
  name: "sales";
  schema: undefined;
  columns: {
    id: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales";
        dataType: "string";
        columnType: "PgUUID";
        data: string;
        driverParam: string;
        notNull: true;
        hasDefault: true;
        isPrimaryKey: true;
        isAutoincrement: false;
        hasRuntimeDefault: true;
        enumValues: undefined;
        baseColumn: never;
        identity: undefined;
        generated: undefined;
      },
      {},
      {}
    >;
    source: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "source";
        tableName: "sales";
        dataType: "string";
        columnType: "PgEnumColumn";
        data: "clover";
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
        isAutoincrement: false;
        hasRuntimeDefault: false;
        enumValues: ["clover"];
        baseColumn: never;
        identity: undefined;
        generated: undefined;
      },
      {},
      {}
    >;
    cloverMerchantId: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "clover_merchant_id";
        tableName: "sales";
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
    cloverPaymentId: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "clover_payment_id";
        tableName: "sales";
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
    occurredAt: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "occurred_at";
        tableName: "sales";
        dataType: "date";
        columnType: "PgTimestamp";
        data: Date;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    subtotalCents: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales";
        dataType: "bigint";
        columnType: "PgBigInt64";
        data: bigint;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    taxCents: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales";
        dataType: "bigint";
        columnType: "PgBigInt64";
        data: bigint;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    discountCents: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales";
        dataType: "bigint";
        columnType: "PgBigInt64";
        data: bigint;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    totalCents: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales";
        dataType: "bigint";
        columnType: "PgBigInt64";
        data: bigint;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    createdAt: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "created_at";
        tableName: "sales";
        dataType: "date";
        columnType: "PgTimestamp";
        data: Date;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    updatedAt: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "updated_at";
        tableName: "sales";
        dataType: "date";
        columnType: "PgTimestamp";
        data: Date;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
  };
  dialect: "pg";
}>;
export declare const salesLineItemsTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
  name: "sales_line_items";
  schema: undefined;
  columns: {
    id: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales_line_items";
        dataType: "string";
        columnType: "PgUUID";
        data: string;
        driverParam: string;
        notNull: true;
        hasDefault: true;
        isPrimaryKey: true;
        isAutoincrement: false;
        hasRuntimeDefault: true;
        enumValues: undefined;
        baseColumn: never;
        identity: undefined;
        generated: undefined;
      },
      {},
      {}
    >;
    saleId: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "sale_id";
        tableName: "sales_line_items";
        dataType: "string";
        columnType: "PgUUID";
        data: string;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    vendorId: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "vendor_id";
        tableName: "sales_line_items";
        dataType: "string";
        columnType: "PgUUID";
        data: string;
        driverParam: string;
        notNull: false;
        hasDefault: false;
        isPrimaryKey: false;
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
    name: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "name";
        tableName: "sales_line_items";
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
    quantity: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales_line_items";
        dataType: "bigint";
        columnType: "PgBigInt64";
        data: bigint;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    grossAmountCents: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales_line_items";
        dataType: "bigint";
        columnType: "PgBigInt64";
        data: bigint;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    discountAmountCents: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales_line_items";
        dataType: "bigint";
        columnType: "PgBigInt64";
        data: bigint;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    netAmountCents: import("drizzle-orm/pg-core").PgColumn<
      {
        name: string;
        tableName: "sales_line_items";
        dataType: "bigint";
        columnType: "PgBigInt64";
        data: bigint;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    cloverItemId: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "clover_item_id";
        tableName: "sales_line_items";
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
    createdAt: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "created_at";
        tableName: "sales_line_items";
        dataType: "date";
        columnType: "PgTimestamp";
        data: Date;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
    updatedAt: import("drizzle-orm/pg-core").PgColumn<
      {
        name: "updated_at";
        tableName: "sales_line_items";
        dataType: "date";
        columnType: "PgTimestamp";
        data: Date;
        driverParam: string;
        notNull: true;
        hasDefault: false;
        isPrimaryKey: false;
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
  };
  dialect: "pg";
}>;
