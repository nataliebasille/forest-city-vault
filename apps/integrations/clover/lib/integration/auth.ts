import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Effect, Option, Redacted, Schema, SynchronizedRef } from "effect";

const CloverAuthTokenSchema = Schema.Struct({
  access_token: Schema.String,
});

const fetchAccessToken = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  const { appId, secretCode, webhookAuthCode, url: baseUrl } =
    yield* CloverConfig;

  yield* Effect.logInfo("clover.auth.token.fetch.begin", {
    workflowStage: "send_request",
    appId,
    baseUrl,
  });

  const request = HttpClientRequest.get(new URL("/oauth/token", baseUrl), {
    urlParams: {
      client_id: appId,
      client_secret: secretCode,
      code: webhookAuthCode,
    },
    acceptJson: true,
  });

  const response = yield* client.execute(request);

  yield* Effect.logInfo("clover.auth.token.fetch.received_response", {
    workflowStage: "receive_response",
    appId,
    status: response.status,
  });

  const okResponse = yield* HttpClientResponse.filterStatusOk(response);
  const body = yield* HttpClientResponse.schemaBodyJson(CloverAuthTokenSchema, {
    errors: "all",
  })(okResponse);

  yield* Effect.logInfo("clover.auth.token.fetch.completed", {
    workflowStage: "decode_response",
    appId,
    status: okResponse.status,
  });

  return Redacted.make(body.access_token);
}).pipe(
  Effect.tapError((error) =>
    Effect.logWarning("clover.auth.token.fetch.failed", {
      workflowStage: "failed",
      failureDisposition: "retryable",
      error: toSafeErrorDetails(error),
    }),
  ),
);

function toSafeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === "object" && error !== null && "_tag" in error) {
    return {
      tag: String((error as { _tag?: unknown })._tag),
    };
  }

  return {
    type: typeof error,
  };
}

const tokenCache = Effect.runSync(
  SynchronizedRef.make(Option.none<Redacted.Redacted<string>>()),
);

/**
 * Yields the cached Clover access token, fetching it on first access and reusing
 * it thereafter. The fetch runs inside `SynchronizedRef.modifyEffect`, so the
 * cache is only written on success — if the token request fails, the ref is left
 * empty and the next access retries. `SynchronizedRef` also serializes access,
 * so concurrent callers share a single in-flight fetch rather than racing.
 */
export const CloverAuthToken = SynchronizedRef.modifyEffect(tokenCache, (current) =>
  Option.match(current, {
    onSome: (token) => Effect.succeed([token, current] as const),
    onNone: () =>
      fetchAccessToken.pipe(
        Effect.map((token) => [token, Option.some(token)] as const),
      ),
  }),
);
