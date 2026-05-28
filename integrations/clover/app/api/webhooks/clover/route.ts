import { AppRoute, tryPromiseOrElse } from "@/runtime";
import {
  parseBody,
  badRequest,
  unauthorized,
} from "@forest-city-vault/nextjs-effect";
import { CloverConfig } from "@forest-city-vault/config";
import { timingSafeEqual } from "crypto";
import { Effect, Either, Schema } from "effect";

const CloverWebhookVerificationPayload = Schema.Struct({
  verificationCode: Schema.String,
});

const CloverWebhookEventPayload = Schema.Struct({
  appId: Schema.String,
  merchants: Schema.Any,
});

export const CloverWebhookPayload = Schema.Union(
  CloverWebhookVerificationPayload,
  CloverWebhookEventPayload,
);

const CLOVER_AUTH_HEADER = "x-clover-auth";

export const POST = AppRoute.route((request: Request) =>
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

    console.log(JSON.stringify(body, null, 2));
    return true;
  }),
);

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}
