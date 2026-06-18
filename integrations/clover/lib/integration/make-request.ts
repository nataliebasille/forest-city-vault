import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpMethod,
} from "@effect/platform";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Effect, Schema } from "effect";

type MakeRequestOptions<A, I, R> = {
  method: HttpMethod.HttpMethod;
  path: string;
  accessToken: string;
  responseSchema: Schema.Schema<A, I, R>;
  urlParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
};

export const makeRequest = <A, I, R>({
  method,
  path,
  accessToken,
  responseSchema,
  urlParams,
  headers,
  body,
}: MakeRequestOptions<A, I, R>) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const { url: baseUrl } = yield* CloverConfig;

    let request = HttpClientRequest.make(method)(new URL(path, baseUrl), {
      urlParams,
      acceptJson: true,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
    });

    if (body !== undefined) {
      request = yield* HttpClientRequest.bodyJson(body)(request);
    }

    const response = yield* client.execute(request);
    const okResponse = yield* HttpClientResponse.filterStatusOk(response);

    return yield* HttpClientResponse.schemaBodyJson(responseSchema, {
      errors: "all",
    })(okResponse);
  });
