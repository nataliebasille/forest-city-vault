import { pgTableCreator } from "drizzle-orm/pg-core";

export const fcvTable = pgTableCreator((name) => `fcv_${name}`);
