import { pgEnum, text } from "drizzle-orm/pg-core";
import { createInboxTables } from "./base_inbox";

export const provider = pgEnum("order_provider", ["clover"]);
export const eventType = pgEnum("order_event_type", ["upsert"]);

export const orders = createInboxTables("order", {
  provider: provider("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  providerObjectId: text("provider_object_id").notNull(), // Clover order id
  eventType: eventType("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
});
