import {
  Headers,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpMethod,
} from "@effect/platform";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Duration, Effect, Option, Schema } from "effect";

type MakeRequestOptions<A, I, R> = {
  method: HttpMethod.HttpMethod;
  path: string;
  accessToken: string;
  responseSchema: Schema.Schema<A, I, R>;
  urlParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
};

// Clover throttles per merchant and answers HTTP 429 with a `Retry-After` header
// when a caller (e.g. the payments drain firing two calls per message across a
// batch) exceeds the limit. Rather than fail the call immediately, honor that
// backoff and retry a bounded number of times so a transient burst rides out the
// limit instead of dropping work. These are deliberately small: the goal is to
// absorb brief 429s, not to block a run for minutes.
const MAX_RATE_LIMIT_RETRIES = 3;
// Used when a 429 omits `Retry-After` or sends an unparseable value.
const DEFAULT_RETRY_AFTER = Duration.seconds(2);
// Ceiling on how long a single `Retry-After` can park the request, so a hostile
// or mistaken header can never stall a run indefinitely.
const MAX_RETRY_AFTER = Duration.seconds(30);

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

    const response = yield* executeWithRateLimitRetry(
      client,
      request,
      { method, path },
      0,
    );
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

/**
 * Executes `request`, retrying on HTTP 429 up to {@link MAX_RATE_LIMIT_RETRIES}
 * times. Each retry waits the server-advertised {@link Headers | Retry-After}
 * delay (clamped to {@link MAX_RETRY_AFTER}) before trying again, so a Clover
 * rate limit backs off and recovers instead of surfacing as a failed message.
 * A non-429 response — or a 429 once retries are exhausted — is returned as-is so
 * the normal `filterStatusOk` path decides success or failure.
 */
function executeWithRateLimitRetry(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  logContext: { readonly method: HttpMethod.HttpMethod; readonly path: string },
  attempt: number,
): ReturnType<HttpClient.HttpClient["execute"]> {
  return Effect.gen(function* () {
    const response = yield* client.execute(request);

    if (response.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
      return response;
    }

    const delay = retryAfterDelay(response);

    yield* Effect.logWarning("clover.api.request.rate_limited", {
      workflowStage: "rate_limited",
      method: logContext.method,
      path: logContext.path,
      status: response.status,
      attempt: attempt + 1,
      maxRetries: MAX_RATE_LIMIT_RETRIES,
      retryAfterMillis: Duration.toMillis(delay),
    });

    yield* Effect.sleep(delay);

    return yield* executeWithRateLimitRetry(
      client,
      request,
      logContext,
      attempt + 1,
    );
  });
}

/**
 * Turns a 429's `Retry-After` header into a wait {@link Duration}. Clover sends a
 * whole number of seconds; an HTTP-date form is also honored. A missing or
 * unparseable value falls back to {@link DEFAULT_RETRY_AFTER}, and every result is
 * clamped to {@link MAX_RETRY_AFTER}.
 */
function retryAfterDelay(
  response: HttpClientResponse.HttpClientResponse,
): Duration.Duration {
  const header = Headers.get("retry-after")(response.headers);
  if (Option.isNone(header)) {
    return DEFAULT_RETRY_AFTER;
  }

  const raw = header.value.trim();

  const seconds = Number(raw);
  if (raw !== "" && Number.isFinite(seconds)) {
    return clampRetryAfter(Duration.seconds(Math.max(0, seconds)));
  }

  const dateMillis = Date.parse(raw);
  if (!Number.isNaN(dateMillis)) {
    return clampRetryAfter(
      Duration.millis(Math.max(0, dateMillis - Date.now())),
    );
  }

  return DEFAULT_RETRY_AFTER;
}

function clampRetryAfter(delay: Duration.Duration): Duration.Duration {
  return Duration.lessThan(delay, MAX_RETRY_AFTER) ? delay : MAX_RETRY_AFTER;
}

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
