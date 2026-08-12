import { HttpClient } from "@effect/platform";
import { Clock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import {
  type CloverItem,
  listCloverItems,
} from "@forest-city-vault/infrastructure-clover";
import { Database } from "@forest-city-vault/infrastructure-database";
import { Effect } from "effect";
import type { ImportSource } from "../import-source";

/**
 * Vendor-items import source: pulls Clover inventory items by ascending
 * `modifiedTime` and enqueues them into the vendor-item inbox using the same
 * contract the webhook writes, so the `POST /api/process/vendor-items` drain
 * reconciles them onto their vendor unchanged.
 *
 * Items are a **mutable** stream (unlike immutable payments), so the watermark
 * axis is `modifiedTime` and the idempotency key includes that timestamp: a
 * given revision of an item enqueues once (re-runs at the inclusive watermark
 * boundary are absorbed), but a later edit — carrying a newer `modifiedTime` —
 * enqueues again so the change is reconciled. Only the item id is stored; the
 * drain re-fetches the current item so it always applies the latest name/price.
 */
export const vendorItemsImportSource: ImportSource<
  CloverItem,
  Clock | CloverConfig | Database | HttpClient.HttpClient
> = {
  entityType: "vendor_item",
  watermarkAxis: "modifiedTime",

  list: ({ merchantId, startTimestamp, limit, offset }) =>
    Effect.map(
      listCloverItems(merchantId, {
        // Always send the `modifiedTime>=` lower bound, including on a cold
        // cursor (`startTimestamp` 0, i.e. a full backfill from the epoch).
        //
        // This deliberately differs from the payments source, which *omits* the
        // filter on a cold cursor: Clover clamps time-based filters on
        // orders/payments/refunds to a 90-day window, so `createdTime>=0` fell
        // outside that window and returned nothing — the payments importer works
        // around that by not sending the bound. The inventory items endpoint has
        // no such documented 90-day clamp, and `modifiedTime` is a documented
        // filterable field (Clover's own item-sync guidance uses
        // `filter=modifiedTime>=<unix_time>`), so sending `modifiedTime>=0` here
        // returns the full catalog. Omitting the bound is the path Clover was
        // observed to mishandle, so the items importer never relies on it.
        filter: `modifiedTime>=${startTimestamp}`,
        orderBy: "modifiedTime ASC",
        limit,
        offset,
      }),
      (page) => page.elements,
    ),

  getTimestamp: (item) => item.modifiedTime,

  enqueue: (items, { merchantId, requestId, receivedAt }) =>
    Effect.gen(function* () {
      const db = yield* Database;
      const inbox = db.schema.inboxes.vendorItems.inbox;

      let inserted = 0;
      for (const item of items) {
        const providerEventId = `I:${item.id}`;
        const record: typeof inbox.$inferInsert = {
          requestId,
          status: "received",
          provider: "clover",
          idempotencyKey: `${merchantId}:${providerEventId}:${item.modifiedTime}`,
          providerEventId,
          providerObjectId: item.id,
          eventType: "upsert",
          occurredAt: new Date(item.modifiedTime),
          payloadJson: JSON.stringify({ merchantId }),
          receivedAt,
        };

        const result = yield* db.query((sql) =>
          sql
            .insert(inbox)
            .values([record])
            .onConflictDoNothing({ target: inbox.idempotencyKey })
            .returning({ id: inbox.id }),
        );
        inserted += result.length;
      }

      return { inserted };
    }),
};
