import { pgEnum, text } from "drizzle-orm/pg-core";
import { createInboxTables } from "./base_inbox";

export const provider = pgEnum("payment_provider", ["clover"]);

export const payments =
  createInboxTables("payment", {
    provider: provider("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerObjectId: text("provider_object_id").notNull(), // payment id / charge id / payment_intent id
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
  });
