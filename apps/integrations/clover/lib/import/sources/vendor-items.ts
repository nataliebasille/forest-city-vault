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
        // On a cold cursor (`startTimestamp` 0) omit the lower bound and walk the
        // whole catalog by ascending `modifiedTime`; once records are imported
        // the watermark advances and subsequent runs send a real
        // `modifiedTime>=<watermark>` bound.
        filter:
          startTimestamp > 0 ? `modifiedTime>=${startTimestamp}` : undefined,
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
