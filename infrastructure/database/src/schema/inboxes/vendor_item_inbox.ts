import { pgEnum, text } from "drizzle-orm/pg-core";
import { createInboxTables } from "./base_inbox";

export const vendorItemProvider = pgEnum("vendor_item_provider", ["clover"]);

// The processing intent for a message: `upsert` covers Clover CREATE/UPDATE
// events and list-backfill rows (both add-or-update the item); `delete` drops
// the item from its vendor.
export const vendorItemEventType = pgEnum("vendor_item_event_type", [
  "upsert",
  "delete",
]);

export const vendorItems = createInboxTables("vendor_item", {
  provider: vendorItemProvider("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  providerObjectId: text("provider_object_id").notNull(), // clover inventory item id
  eventType: vendorItemEventType("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
});
