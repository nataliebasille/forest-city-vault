import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { AppRoute } from "@/runtime";
import { now } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Database } from "@forest-city-vault/database";
import {
  badRequest,
  parseBody,
  unauthorized,
} from "@forest-city-vault/nextjs-core";
import { timingSafeEqual } from "crypto";
import { Effect, Either, Schema } from "effect";

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

const handler = (request: Request) =>
  Effect.gen(function* () {
    const { webhookAuthCode } = yield* CloverConfig;

    const body = yield* Either.match(yield* parseBody(CloverWebhookPayload), {
      onLeft: (error) => badRequest("Invalid request body", error),
      onRight: (value) => Effect.succeed(value),
    });

    if ("verificationCode" in body) {
      return true;
    }

    const actualAuthCode = request.headers.get(CLOVER_AUTH_HEADER);
    if (!actualAuthCode || !safeEqual(actualAuthCode, webhookAuthCode)) {
      return yield* unauthorized("Missing or invalid Clover auth header");
    }

    yield* recordWebhookEvents(body);

    return true;
  });

export const POST = AppRoute.route(handler);

function recordWebhookEvents(event: typeof CloverWebhookEventPayload.Encoded) {
  return Effect.gen(function* () {
    const db = yield* Database;
    const { requestId } = yield* RequestTrace;
    const receivedAt = yield* now;
    yield* db.transaction(async (tx) => {
      const appId = event.appId;

      for (const [merchantId, cloverEvents] of Object.entries(
        event.merchants,
      )) {
        for (const cloverEvent of cloverEvents) {
          const idempotencyKey = `${appId}:${merchantId}:${cloverEvent.objectId}:${cloverEvent.type}:${cloverEvent.ts}`;
          const [eventType, eventId] = cloverEvent.objectId.split(":");
          const cloverEventRecord: typeof db.schema.cloverEvents.$inferInsert =
            {
              appId,
              requestId,
              idempotencyKey,
              merchantId,
              eventType,
              eventId,
              eventTimestampMs: cloverEvent.ts,
              changeType: cloverEvent.type,
              payload: cloverEvent,
              receivedAt,
            };

          await tx
            .insert(db.schema.cloverEvents)
            .values([cloverEventRecord])
            .onConflictDoNothing({
              target: db.schema.cloverEvents.idempotencyKey,
            });
        }
      }
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
