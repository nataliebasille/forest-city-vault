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
    yield* Effect.logInfo("clover.api.request.begin", {
      workflowStage: "send_request",
      method,
      path,
      hasBody: body !== undefined,
      urlParamCount: Object.keys(urlParams ?? {}).length,
    });

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
    yield* Effect.logInfo("clover.api.request.received_response", {
      workflowStage: "receive_response",
      method,
      path,
      status: response.status,
    });

    const okResponse = yield* HttpClientResponse.filterStatusOk(response);
    const payload = yield* HttpClientResponse.schemaBodyJson(responseSchema, {
      errors: "all",
    })(okResponse);

    yield* Effect.logInfo("clover.api.request.completed", {
      workflowStage: "decode_response",
      method,
      path,
      status: okResponse.status,
    });

    return payload;
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("clover.api.request.failed", {
        workflowStage: "failed",
        method,
        path,
        failureDisposition: "retryable_or_terminal",
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
