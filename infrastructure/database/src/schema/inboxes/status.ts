import { pgEnum } from "drizzle-orm/pg-core";

export const inboxStatus = pgEnum("inbox_status", [
  "received",
  "processed",
  "failed",
  "dead_letter",
]);
