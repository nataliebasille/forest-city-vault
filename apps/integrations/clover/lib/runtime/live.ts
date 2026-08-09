import { FetchHttpClient } from "@effect/platform";
import { SystemClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { SystemIdGenerator } from "@forest-city-vault/core-id-generator";
import {
  databaseSagaScoped,
  DatabaseLive,
} from "@forest-city-vault/infrastructure-database";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";
import { Config, Effect, Layer, Redacted } from "effect";
import { RequestTraceLayer } from "./middleware/request-trace";

/**
 * Non-config services shared by every Clover boundary: clock, id generator and
 * HTTP client. Config is added separately because routes and jobs need different
 * amounts of it — routes load the full {@link CloverConfig} (OAuth, webhook and
 * processor secrets included), while a job loads only the narrow subset the
 * import/drain path actually reads (see {@link cloverPaymentsJobConfig}).
 */
const CoreServices = Layer.mergeAll(
  SystemClock,
  SystemIdGenerator,
  FetchHttpClient.layer,
);

/**
 * Services shared by every Clover route, regardless of how the {@link Database}
 * is provided. Kept separate so the transactional and pooled app layers below
 * differ *only* in their database wiring.
 *
 * Loads the full {@link CloverConfig} (every Clover key) because the route
 * surface spans OAuth, the webhook and the internal processor. Includes
 * {@link RequestTraceLayer} so every route carries a {@link RequestTrace} derived
 * from the request headers — provided as a layer (not middleware) so it satisfies
 * `defineRoute`'s dependency check.
 */
const AppCommon = Layer.mergeAll(
  CloverConfig.Default,
  CoreServices,
  RequestTraceLayer,
);

/**
 * A {@link CloverConfig} loaded from only the environment variables the payments
 * import + drain path actually reads, so a scheduled job does not have to be
 * given secrets it never uses.
 *
 * Required:
 *   - `CLOVER_URL`         — Clover API base URL.
 *   - `CLOVER_MERCHANT_ID` — the single merchant this job imports.
 *
 * Situational:
 *   - `CLOVER_MERCHANT_ACCESS_TOKEN` — the static-token seam. When set (and the
 *     merchant matches), the Clover API is called directly with no token store
 *     read, which is the intended mode for this job.
 *   - `CLOVER_TOKEN_ENCRYPTION_KEY` — only consulted when there is *no* static
 *     token and the job falls back to the OAuth token store to decrypt a stored
 *     access token. Defaults to empty so it is not required in static-token mode;
 *     a fallback read with an empty key fails loudly at that point.
 *   - `CLOVER_APP_ID` — only used when the OAuth token store refreshes a token
 *     (sent as the OAuth `client_id`). The import path no longer reads it, so it
 *     is not required in static-token mode; defaults to empty.
 *
 * Every other Clover key (`CLOVER_SECRET_CODE`, `CLOVER_WEBHOOK_AUTH_CODE`,
 * `CLOVER_PROCESSOR_SECRET`, `CLOVER_OAUTH_URL`, `CLOVER_OAUTH_STATE_SECRET`,
 * `CLOVER_OAUTH_REDIRECT_URI`) belongs to the OAuth / webhook / HTTP-processor
 * surfaces the job never touches, so they are filled with unused placeholders
 * rather than demanded as configuration.
 */
const cloverPaymentsJobConfig = Layer.effect(
  CloverConfig,
  Effect.gen(function* () {
    const url = yield* Config.string("CLOVER_URL");
    const merchantId = yield* Config.string("CLOVER_MERCHANT_ID");
    const merchantAccessToken = yield* Config.option(
      Config.redacted("CLOVER_MERCHANT_ACCESS_TOKEN"),
    );
    const tokenEncryptionKey = yield* Config.redacted(
      "CLOVER_TOKEN_ENCRYPTION_KEY",
    ).pipe(Config.withDefault(Redacted.make("")));
    const appId = yield* Config.string("CLOVER_APP_ID").pipe(
      Config.withDefault(""),
    );

    return CloverConfig.make({
      appId,
      url,
      merchantId,
      merchantAccessToken,
      tokenEncryptionKey,
      // Unused by the import + drain path — placeholders keep the CloverConfig
      // shape complete without requiring the OAuth/webhook/processor secrets.
      secretCode: "",
      webhookAuthCode: "",
      processorSecret: Redacted.make(""),
      oauthUrl: "",
      oauthStateSecret: Redacted.make(""),
      oauthRedirectUri: "",
    });
  }),
);

/**
 * Production dependency layer for Clover routes.
 *
 * The {@link Database} is provided **saga-scoped** via `provideSagaScoped`: it
 * declares `databaseSagaScoped` as the boundary's saga-scoped layer, and the
 * `withSaga` middleware the `route` helper composes rebuilds it per request —
 * opening a transaction (on a connection from `DatabaseLive`'s pool), binding the
 * transaction-scoped {@link Database}, and enlisting it as a participant of the
 * request saga. Each request gets its own transaction that the saga commits on
 * success or rolls back on any failure, defect or interruption. Handlers simply
 * `yield* Database` and get that transaction.
 *
 * Because `provideSagaScoped` discharges the `Saga` requirement internally (it is
 * satisfied by the rebuilding `withSaga`, not by `defineRoute`), this layer has
 * no residual `Saga` requirement — which is what lets the saga-agnostic
 * `defineRoute` apply its middleware *inside* the layer. The base
 * `DatabaseLive` pool is provided alongside so `withSaga` can build the
 * per-request transaction.
 *
 * Kept in its own module so tests can swap it via `mock.module` without ever
 * constructing the production resources.
 */
export const AppLive = Layer.mergeAll(
  AppCommon,
  DatabaseLive,
  provideSagaScoped(databaseSagaScoped),
).pipe(Layer.orDie);

/**
 * Dependency layer for routes that must **not** run inside one enclosing request
 * transaction. The {@link Database} is the base pool database (not a saga
 * participant). Paired with the `pooledRoute` helper, which deliberately does not
 * compose `withSaga`, there is no request-level saga to commit or roll back.
 *
 * Used by inbox drains: `drain` runs each message as its own saga (its own
 * transaction) and, when a message rolls back, records the failure on a separate
 * pooled connection that survives that rollback. Wrapping the whole request in a
 * single transaction would nest those per-message transactions and defeat that
 * guarantee, so drain-style routes use this pooled layer instead.
 */
export const AppLivePooled = Layer.merge(AppCommon, DatabaseLive).pipe(
  Layer.orDie,
);

/**
 * Dependency layer for standalone jobs (the scheduled GitHub Action runner and
 * the local interval scheduler) that run the Clover payments cycle outside any
 * HTTP request. It provides the base pool {@link Database} and the core services,
 * but differs from {@link AppLivePooled} in two deliberate ways:
 *
 * 1. No {@link RequestTraceLayer} — a job has no request headers, and its callers
 *    supply their own `requestId` explicitly.
 * 2. A **narrow** {@link CloverConfig} ({@link cloverPaymentsJobConfig}) that only
 *    loads the keys the import + drain path reads, so the job (and its workflow
 *    secrets) never require the OAuth/webhook/processor configuration.
 */
export const JobLive = Layer.mergeAll(
  cloverPaymentsJobConfig,
  CoreServices,
  DatabaseLive,
).pipe(Layer.orDie);
