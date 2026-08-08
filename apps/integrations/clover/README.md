# clover-webhooks

Backend-only Next.js service for Clover webhook handling.

## Scripts

- `pnpm dev` - Run local dev server on port 3103
- `pnpm build` - Build for production
- `pnpm start` - Start production server on port 3103
- `pnpm lint` - Lint source
- `pnpm import:schedule` - Run the local payment importer on an interval (see [Local interval importer](#local-interval-importer))

## API Routes

- `GET /api/health` - Health check endpoint
- `GET /api/oauth/callback` - Clover OAuth callback / Site URL (redirects to Clover authorize on launch, captures per-merchant tokens on return)
- `POST /api/webhooks/clover` - Clover webhook receiver
- `POST /api/import/payments` - Internal-only import trigger: lists payments from the Clover API and enqueues them into the payments inbox (authenticated bearer secret)
- `POST /api/process/payments` - Internal-only inbox drain trigger (authenticated bearer secret)

## Notes

This app is intentionally backend-only. It only exposes API route handlers under `app/api`.

## Clover auth

Clover uses a per-merchant OAuth 2.0 authorization-code flow. Access tokens are
scoped to a single merchant and expire, so there is no single global token. This
is an **internal app for a single merchant**, so authorization is restricted to
one configured merchant id.

### Authorization flow

1. **App launch (no `code`).** A merchant launches the app. Clover redirects to
   this app's **Site URL** (`/api/oauth/callback`) with `merchant_id` and
   `client_id` — **no `code`**. The route validates that:
   - `merchant_id` is present and exactly equals `CLOVER_MERCHANT_ID`.
   - `client_id` is present and exactly equals `CLOVER_APP_ID`.

   Invalid or unexpected values are rejected (`400`/`403`) **before** any
   redirect to Clover.

2. **State + redirect.** On a valid launch the route mints a cryptographically
   random **OAuth `state` nonce**, seals the correlation data (nonce,
   `merchant_id`, `client_id`, configured `redirect_uri`, issued-at and
   expiration timestamps) into an HMAC-signed **HttpOnly cookie**, and `302`
   redirects to Clover's `/oauth/v2/authorize` endpoint with `client_id`,
   `response_type=code`, `merchant_id` (the allowed merchant), the configured
   `redirect_uri`, and `state` (the nonce). Every security-sensitive parameter
   comes from validated configuration, never from the request.

   The authorize endpoint is on Clover's **merchant-facing web host**
   (`CLOVER_OAUTH_URL`, e.g. `sandbox.dev.clover.com`) — a different host from
   the API host used for token exchange/refresh (`CLOVER_URL`, e.g.
   `apisandbox.dev.clover.com`). Pointing authorize at the API host bounces the
   merchant back to login in a loop.

3. **Callback (`code` present).** Clover redirects back to the same callback
   with a single-use `code`, plus `state`, `merchant_id` and `client_id`. Before
   exchanging the code the route re-opens the sealed state cookie and validates
   **all** of:
   - `code`, `state`, `merchant_id`, `client_id` are present.
   - The state cookie exists, has the expected format, and its signature
     verifies.
   - The state has not expired.
   - The returned `state` equals the sealed nonce.
   - The sealed `merchant_id` equals the callback `merchant_id`, which equals
     `CLOVER_MERCHANT_ID`.
   - The sealed `client_id` equals the callback `client_id`, which equals
     `CLOVER_APP_ID`.
   - The sealed `redirect_uri` equals `CLOVER_OAUTH_REDIRECT_URI`.

   Any failure returns a controlled `400`/`403` (generic message, no code/state
   echoed) and **does not** call Clover or persist tokens.

4. **Token exchange.** Only after every check passes does the route exchange the
   code at `POST /oauth/v2/token` (using `CLOVER_APP_ID` and
   `CLOVER_SECRET_CODE`) for an `access_token` / `refresh_token` pair, persisting
   it **encrypted at rest** in `fcv_clover_merchant_tokens` (keyed by the
   validated `merchant_id`). The response is a minimal `{ "connected": true }`
   with `Cache-Control: no-store`; no tokens are returned.
5. **Payment processing** (`POST /api/process/payments`) resolves the merchant's
   token via `getMerchantAccessToken(merchantId)`: it returns the stored access
   token, transparently refreshing it at `POST /oauth/v2/refresh` when expired.
   If the merchant has no token, or the refresh token has expired, processing
   fails terminally and the merchant must (re)authorize.

### Direct access token (test)

For a test merchant whose access token was issued **outside** the OAuth app flow,
set `CLOVER_MERCHANT_ACCESS_TOKEN` to that token. When it is set and a request is
for the configured `CLOVER_MERCHANT_ID`, the app uses it directly against the
Clover API (`resolveMerchantAccessToken`) instead of reading/refreshing an
OAuth-stored token — no OAuth authorization is required. Any other merchant, or an
unset token, falls back to the OAuth token store.

This is intended for spikes/tests: the static token is not refreshed, so when it
expires it must be reissued and updated manually.

To pull a test merchant's recent payments into the database without webhooks:

1. Configure `CLOVER_MERCHANT_ID`, `CLOVER_MERCHANT_ACCESS_TOKEN`, `CLOVER_URL`
   (e.g. `https://apisandbox.dev.clover.com`) and `CLOVER_PROCESSOR_SECRET`.
2. `POST /api/import/payments` with `Authorization: Bearer <CLOVER_PROCESSOR_SECRET>`.
   Optional JSON body: `{ "limit": 50, "offset": 0, "filter": "createdTime>=<epochMs>" }`.
   This lists payments from the Clover API and enqueues them into the payments
   inbox (idempotent — re-running does not duplicate rows).
3. `POST /api/process/payments` with the same bearer header to drain the inbox
   into sales (the existing drain, unchanged).

### Local interval importer

`pnpm import:schedule` runs a local scheduler ([scripts/import-scheduler.ts](scripts/import-scheduler.ts))
that drives the two steps above on an interval. It assumes the dev server is
already running, so use two terminals:

```sh
# terminal 1 — the service
pnpm dev

# terminal 2 — the interval importer
pnpm import:schedule
```

Each cycle it calls `POST /api/import/payments` then `POST /api/process/payments`
(both with `CLOVER_PROCESSOR_SECRET`), never overlapping cycles, and logs the
outcome. Stop it with Ctrl-C. It reads the same repo-root `.env` as the app.

Configuration (all optional except the secret, read from `.env` or the shell):

- `CLOVER_PROCESSOR_SECRET` - required; bearer secret for both endpoints.
- `CLOVER_IMPORT_BASE_URL` - dev server base URL. Default `http://localhost:3103`.
- `CLOVER_IMPORT_INTERVAL_MS` - delay between cycles. Default `60000` (60s).
- `CLOVER_IMPORT_LIMIT` - page size passed to the import endpoint (route default 50).
- `CLOVER_IMPORT_FILTER` - Clover query filter, e.g. `createdTime>=1700000000000`.

The importer requires the merchant's Clover API token
(`CLOVER_MERCHANT_ACCESS_TOKEN`) to have **read permission on payments**. The
list call does not request expandable fields, so a payments-only token works; a
token that additionally lacks order/line-item permission is fine. A `401` means
the token is invalid or scoped to a different merchant.

### Internal payment processor endpoint

`POST /api/process/payments` is an internal scheduler/worker endpoint.

- It is **not** a browser login flow and does not use cookies.
- It remains **POST-only**.
- Do not enable public CORS access for this endpoint.
- Every request must send:
  - `Authorization: Bearer your-processor-secret`

Generate `CLOVER_PROCESSOR_SECRET` as a long random value (for example
`openssl rand -hex 32`), store it in each environment's secret manager, and
inject it into this app as an environment variable. Never commit real values.

#### Secret rotation

1. Generate a new strong secret.
2. Update the secret in the scheduler/worker configuration.
3. Update the app environment (`CLOVER_PROCESSOR_SECRET`).
4. Deploy/restart the scheduler and app so both use the same new value.
5. Revoke the old value.

#### Scheduler usage

Call this endpoint from trusted infrastructure only (for example a private cron
worker or internal scheduler), always over HTTPS in production, with the bearer
header above.

#### Execution guard

The route includes a lightweight in-process overlap guard that rejects a second
trigger while one run is already active in the same application process. This is
only accidental-trigger protection. It does **not** coordinate across multiple
instances. Database-level inbox concurrency/claiming correctness is handled
separately by the inbox implementation.

### OAuth state cookie & single-use behavior

- The `state` query parameter is a random nonce; the trusted correlation data
  lives in the HMAC-signed cookie, not in the query string.
- Cookie attributes: `HttpOnly`, `SameSite=Lax`, `Path=/api/oauth/callback`, and
  `Secure` when the callback runs over HTTPS (production). Lifetime ~10 minutes
  (matching the sealed expiration).
- The cookie is **deleted on both success and failure** of the callback. A
  browser-cookie state prevents replay within the application flow: a second
  callback no longer carries the original cookie and is rejected. Clover's
  single-use authorization `code` independently prevents code reuse at the token
  endpoint.

### Sandbox vs production

- Sandbox: `CLOVER_URL=https://apisandbox.dev.clover.com`,
  `CLOVER_OAUTH_URL=https://sandbox.dev.clover.com`. `CLOVER_OAUTH_REDIRECT_URI`
  may be `http` for local/sandbox testing.
- Production: `CLOVER_OAUTH_REDIRECT_URI` **must be an absolute `https` URL**
  (enforced at config load when `NODE_ENV=production`).
- The Clover app dashboard **Site URL** and **redirect URI** must exactly match
  the configured `CLOVER_OAUTH_REDIRECT_URI`.

Tokens are encrypted with AES-256-GCM using a key derived from
`CLOVER_TOKEN_ENCRYPTION_KEY`; only ciphertext is stored in the database.

`CLOVER_WEBHOOK_AUTH_CODE` is unrelated to OAuth — it is only used to verify the
`x-clover-auth` header on inbound webhooks.

### Secret rotation

- Rotating `CLOVER_OAUTH_STATE_SECRET` invalidates only **in-progress**
  authorization attempts (their sealed cookies no longer verify); merchants
  simply relaunch. It never touches stored tokens.
- Rotating `CLOVER_TOKEN_ENCRYPTION_KEY` is a **separate token-migration
  concern**: existing ciphertext was sealed under the old key and is out of scope
  for the OAuth flow.

### Environment variables

- `CLOVER_APP_ID` - Clover app / client id
- `CLOVER_SECRET_CODE` - Clover app / client secret
- `CLOVER_URL` - Clover API base URL for token exchange/refresh (e.g. `https://apisandbox.dev.clover.com`)
- `CLOVER_OAUTH_URL` - Clover merchant-facing web host for the OAuth authorize/login step (e.g. `https://sandbox.dev.clover.com`)
- `CLOVER_WEBHOOK_AUTH_CODE` - shared secret for verifying webhook `x-clover-auth`
- `CLOVER_PROCESSOR_SECRET` - shared bearer secret for internal `POST /api/process/payments`
- `CLOVER_TOKEN_ENCRYPTION_KEY` - secret used to encrypt stored OAuth tokens
- `CLOVER_MERCHANT_ID` - the single merchant id allowed to authorize this app
- `CLOVER_MERCHANT_ACCESS_TOKEN` - optional static Clover API access token for `CLOVER_MERCHANT_ID` that bypasses the OAuth token store (test/spike use; not refreshed)
- `CLOVER_OAUTH_REDIRECT_URI` - exact OAuth callback URL (absolute; https in production); must match the Clover dashboard Site URL / redirect URI
- `CLOVER_OAUTH_STATE_SECRET` - secret used to sign the OAuth CSRF state cookie (must be distinct from every other Clover secret)
