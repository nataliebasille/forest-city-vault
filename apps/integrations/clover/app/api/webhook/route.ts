import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { route } from "@/runtime";
import { now } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Database } from "@forest-city-vault/infrastructure-database";
import {
  badRequest,
  parseBody,
  unauthorized,
} from "@forest-city-vault/platform-nextjs-effect";
import { timingSafeEqual } from "crypto";
import { Effect, Either, Schema } from "effect";
import { NextRequest } from "next/server";

const CloverEvent = Schema.Struct({
  objectId: Schema.String,
  type: Schema.Literal("CREATE", "UPDATE", "DELETE"),
  ts: Schema.Number,
});

const CloverWebhookVerificationPayload = Schema.Struct({
  verificationCode: Schema.String,
});

const CloverWebhookEventPayload = Schema.Struct({
  appId: Schema.String,
  merchants: Schema.Record({
    key: Schema.String,
    value: Schema.Array(CloverEvent),
  }),
});

export const CloverWebhookPayload = Schema.Union(
  CloverWebhookVerificationPayload,
  CloverWebhookEventPayload,
);

const CLOVER_AUTH_HEADER = "x-clover-auth";

const handler = (request: NextRequest) =>
  Effect.gen(function* () {
    const { webhookAuthCode } = yield* CloverConfig;
    const { requestId } = yield* RequestTrace;

    yield* Effect.logInfo("clover.webhook.received", {
      requestId,
      workflowStage: "decode_payload",
    });

    const body = yield* Either.match(yield* parseBody(CloverWebhookPayload), {
      onLeft: (error) => badRequest("Invalid request body", error),
      onRight: (value) => Effect.succeed(value),
    });

    if ("verificationCode" in body) {
      yield* Effect.logInfo("clover.webhook.verification.received", {
        requestId,
        workflowStage: "verification",
      });

      return true;
    }

    const actualAuthCode = request.headers.get(CLOVER_AUTH_HEADER);
    if (!actualAuthCode || !safeEqual(actualAuthCode, webhookAuthCode)) {
      yield* Effect.logWarning("clover.webhook.authentication.rejected", {
        requestId,
        workflowStage: "authenticate",
        authHeaderPresent: Boolean(actualAuthCode),
        failureDisposition: "expected_terminal",
      });

      return yield* unauthorized("Missing or invalid Clover auth header");
    }

    yield* recordWebhookEvents(body);

    yield* Effect.logInfo("clover.webhook.accepted", {
      requestId,
      workflowStage: "completed",
    });

    return true;
  });

export const POST = route(handler);

function recordWebhookEvents(event: typeof CloverWebhookEventPayload.Encoded) {
  return Effect.gen(function* () {
    const db = yield* Database;
    const { requestId } = yield* RequestTrace;
    const receivedAt = yield* now;
    const appId = event.appId;
    const merchants = Object.entries(event.merchants);
    let insertedPayments = 0;
    let skippedNonPaymentEvents = 0;
    let totalEvents = 0;

    yield* Effect.logInfo("clover.webhook.persist.begin", {
      requestId,
      appId: event.appId,
      merchantCount: merchants.length,
      workflowStage: "persist_inbox",
    });

    for (const [merchantId, cloverEvents] of merchants) {
      for (const cloverEvent of cloverEvents) {
        totalEvents++;
        const idempotencyKey = `${appId}:${merchantId}:${cloverEvent.objectId}:${cloverEvent.type}:${cloverEvent.ts}`;
        const [eventType, paymentId] = cloverEvent.objectId.split(":");
        if (eventType !== "P") {
          skippedNonPaymentEvents++;
          continue;
        }
        const paymentInboxRecord: typeof db.schema.inboxes.payments.inbox.$inferInsert =
          {
            requestId,
            status: "received",
            provider: "clover",
            idempotencyKey,
            providerEventId: cloverEvent.objectId,
            providerObjectId: paymentId,
            eventType: "payment",
            occurredAt: new Date(cloverEvent.ts),
            payloadJson: JSON.stringify({ ...cloverEvent, merchantId }),
            receivedAt,
          };

        yield* db.query((sql) =>
          sql
            .insert(db.schema.inboxes.payments.inbox)
            .values([paymentInboxRecord])
            .onConflictDoNothing({
              target: db.schema.inboxes.payments.inbox.idempotencyKey,
            }),
        );
        insertedPayments++;
      }
    }

    yield* Effect.logInfo("clover.webhook.persist.completed", {
      requestId,
      appId: event.appId,
      workflowStage: "persist_inbox",
      totalEvents,
      insertedPayments,
      skippedNonPaymentEvents,
    });
  });
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}
