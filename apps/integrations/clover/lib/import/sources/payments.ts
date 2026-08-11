import { HttpClient } from "@effect/platform";
import { Clock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import {
  type CloverPayment,
  listCloverPayments,
} from "@forest-city-vault/infrastructure-clover";
import { Database } from "@forest-city-vault/infrastructure-database";
import { Effect } from "effect";
import type { ImportSource } from "../import-source";

/**
 * Payments import source: pulls Clover payments by ascending `createdTime` and
 * enqueues them into the payments inbox using the same contract the webhook
 * writes, so the existing `POST /api/process/payments` drain turns them into
 * sales unchanged.
 */
export const paymentsImportSource: ImportSource<
  CloverPayment,
  Clock | CloverConfig | Database | HttpClient.HttpClient
> = {
  entityType: "payment",
  watermarkAxis: "createdTime",

  list: ({ merchantId, startTimestamp, limit, offset }) =>
    Effect.map(
      listCloverPayments(merchantId, {
        // Always send an explicit `createdTime>=<startTimestamp>` lower bound.
        // The engine guarantees `startTimestamp` is a real, recent-enough epoch
        // (the stored watermark, or a cold-start backfill floor of
        // `now - coldStartLookbackMs`) — never `0`. This matters on Clover's
        // production payments list: omitting the filter returns only a recent
        // ~90-day window, and a `createdTime>=0` (or older-than-~8-months) bound
        // returns nothing. A real floor lands in the range Clover serves, and
        // ascending `createdTime` paging then walks the history forward.
        filter: `createdTime>=${startTimestamp}`,
        orderBy: "createdTime ASC",
        limit,
        offset,
      }),
      (page) => page.elements,
    ),

  getTimestamp: (payment) => payment.createdTime,

  enqueue: (payments, { merchantId, requestId, receivedAt }) =>
    Effect.gen(function* () {
      const db = yield* Database;
      const inbox = db.schema.inboxes.payments.inbox;

      let inserted = 0;
      for (const payment of payments) {
        const providerEventId = `P:${payment.id}`;
        const record: typeof inbox.$inferInsert = {
          requestId,
          status: "received",
          provider: "clover",
          idempotencyKey: `${merchantId}:${providerEventId}`,
          providerEventId,
          providerObjectId: payment.id,
          eventType: "payment",
          occurredAt: new Date(payment.createdTime),
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
