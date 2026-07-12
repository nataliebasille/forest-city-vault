import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Effect, Schema, Redacted } from "effect";

const CloverAuthTokenSchema = Schema.Struct({
  access_token: Schema.String,
});

export class CloverAuthToken extends Effect.Service<CloverAuthToken>()(
  "CloverAuthToken",
  {
    effect: Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const { appId, secretCode, webhookAuthCode, url: baseUrl } =
        yield* CloverConfig;

      const getAccessToken = yield* Effect.cached(
        Effect.gen(function* () {
          const request = HttpClientRequest.get(
            new URL("/oauth/token", baseUrl),
            {
              urlParams: {
                client_id: appId,
                client_secret: secretCode,
                code: webhookAuthCode,
              },
              acceptJson: true,
            },
          );

          const response = yield* client.execute(request);
          const okResponse = yield* HttpClientResponse.filterStatusOk(response);
          const body = yield* HttpClientResponse.schemaBodyJson(
            CloverAuthTokenSchema,
            {
              errors: "all",
            },
          )(okResponse);

          return Redacted.make(body.access_token);
        }),
      );

      return { getAccessToken } as const;
    }),
  },
) {}

