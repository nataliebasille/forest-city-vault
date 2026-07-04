import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { route } from "@/runtime";
import { now } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Database } from "@forest-city-vault/infrastructure-database";
import {
  badRequest,
  parseBody,
  unauthorized,
} from "@forest-city-vault/nextjs-core";
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

    const body = yield* Either.match(yield* parseBody(CloverWebhookPayload), {
      onLeft: (error) => badRequest("Invalid request body", error),
      onRight: (value) => Effect.succeed(value),
    });

    if ("verificationCode" in body) {
      yield* Effect.log("Received Clover webhook verification request", {
        verificationCode: body.verificationCode,
      });

      return true;
    }

    const actualAuthCode = request.headers.get(CLOVER_AUTH_HEADER);
    if (!actualAuthCode || !safeEqual(actualAuthCode, webhookAuthCode)) {
      return yield* unauthorized("Missing or invalid Clover auth header");
    }

    yield* recordWebhookEvents(body);

    return true;
  });

export const POST = route(handler);

function recordWebhookEvents(event: typeof CloverWebhookEventPayload.Encoded) {
  return Effect.gen(function* () {
    const db = yield* Database;
    const { requestId } = yield* RequestTrace;
    const receivedAt = yield* now;
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const appId = event.appId;

        for (const [merchantId, cloverEvents] of Object.entries(
          event.merchants,
        )) {
          for (const cloverEvent of cloverEvents) {
            const idempotencyKey = `${appId}:${merchantId}:${cloverEvent.objectId}:${cloverEvent.type}:${cloverEvent.ts}`;
            const [eventType, paymentId] = cloverEvent.objectId.split(":");
            if (eventType !== "P") continue;
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

            yield* tx
              .insert(db.schema.inboxes.payments.inbox)
              .values([paymentInboxRecord])
              .onConflictDoNothing({
                target: db.schema.inboxes.payments.inbox.idempotencyKey,
              });
          }
        }
      }),
    );
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
