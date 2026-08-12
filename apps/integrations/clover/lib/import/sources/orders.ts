import { HttpClient } from "@effect/platform";
import { Clock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import {
  type CloverOrder,
  listCloverOrders,
} from "@forest-city-vault/infrastructure-clover";
import { Database } from "@forest-city-vault/infrastructure-database";
import { Effect } from "effect";
import type { ImportSource } from "../import-source";

const ORDERS_LIST_LIMIT = 50;
const MAX_BOUNDARY_EXHAUST_PAGES = 10;

export const ordersImportSource: ImportSource<
  CloverOrder,
  Clock | CloverConfig | Database | HttpClient.HttpClient
> = {
  entityType: "order",
  watermarkAxis: "modifiedTime",

  list: ({ merchantId, startTimestamp }) =>
    Effect.gen(function* () {
      const listed: CloverOrder[] = [];

      let offset = 0;
      let pageCount = 0;
      while (pageCount < MAX_BOUNDARY_EXHAUST_PAGES) {
        const page = yield* listCloverOrders(merchantId, {
          filter: `modifiedTime>=${startTimestamp}`,
          orderBy: "modifiedTime ASC",
          limit: ORDERS_LIST_LIMIT,
          offset,
        });

        listed.push(...page.elements);
        pageCount += 1;

        if (page.elements.length < ORDERS_LIST_LIMIT) {
          break;
        }

        const last = page.elements[page.elements.length - 1];
        // Clover's ASC ordering is not strict enough to rely on one page at the
        // watermark boundary: when many orders share the same modifiedTime, records
        // past the first page can be skipped. Exhaust a trailing overlap window of
        // boundary pages so idempotent enqueue can safely absorb duplicates.
        if (last?.modifiedTime !== startTimestamp) {
          break;
        }

        offset += ORDERS_LIST_LIMIT;
      }

      return listed;
    }),

  getTimestamp: (order) => order.modifiedTime,

  enqueue: (orders, { merchantId, requestId, receivedAt }) =>
    Effect.gen(function* () {
      const db = yield* Database;
      const inbox = db.schema.inboxes.orders.inbox;

      let inserted = 0;
      for (const order of orders) {
        const providerEventId = `O:${order.id}`;
        const record: typeof inbox.$inferInsert = {
          requestId,
          status: "received",
          provider: "clover",
          idempotencyKey: `${merchantId}:${providerEventId}:${order.modifiedTime}`,
          providerEventId,
          providerObjectId: order.id,
          eventType: "upsert",
          occurredAt: new Date(order.modifiedTime),
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
