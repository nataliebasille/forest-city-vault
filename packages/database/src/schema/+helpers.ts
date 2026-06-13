import { bigint, pgTableCreator, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

export const fcvTable = pgTableCreator((name) => `fcv_${name}`);

export const id = (name = "id") =>
  uuid(name)
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = timestamp("created_at", {
  withTimezone: true,
}).notNull();
export const updatedAt = timestamp("updated_at", {
  withTimezone: true,
}).notNull();

export const cents = (name: string) => bigint(name, { mode: "bigint" });
