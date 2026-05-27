import { AppRoute, tryPromiseOrElse } from "@/runtime";
import {
  parseBody,
  badRequest,
  unauthorized,
} from "@forest-city-vault/nextjs-effect";
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
    const body = yield* Either.match(yield* parseBody(CloverWebhookPayload), {
      onLeft: (error) => badRequest("Invalid request body", error),
      onRight: (value) => Effect.succeed(value),
    });

    if ("verificationCode" in body) {
      return true;
    }

    // TODO Configure app config
    // if (!expectedAuthCode) {
    //   return yield* Effect.fail(
    //     makeUnauthorized("Clover webhook auth code is not configured"),
    //   );
    // }

    const actualAuthCode = request.headers.get(CLOVER_AUTH_HEADER);
    if (!actualAuthCode) {
      // || !safeEqual(actualAuthCode, expectedAuthCode)) {
      return yield* unauthorized("Missing Clover auth header");
    }

    console.log(body);
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
