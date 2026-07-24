# clover-webhooks

Backend-only Next.js service for Clover webhook handling.

## Scripts

- `pnpm dev` - Run local dev server on port 3010
- `pnpm build` - Build for production
- `pnpm start` - Start production server on port 3010
- `pnpm lint` - Lint source

## API Routes

- `GET /api/health` - Health check endpoint
- `GET /api/oauth/callback` - Clover OAuth callback / Site URL (redirects to Clover authorize on launch, captures per-merchant tokens on return)
- `POST /api/webhooks/clover` - Clover webhook receiver

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
- `CLOVER_TOKEN_ENCRYPTION_KEY` - secret used to encrypt stored OAuth tokens
- `CLOVER_MERCHANT_ID` - the single merchant id allowed to authorize this app
- `CLOVER_OAUTH_REDIRECT_URI` - exact OAuth callback URL (absolute; https in production); must match the Clover dashboard Site URL / redirect URI
- `CLOVER_OAUTH_STATE_SECRET` - secret used to sign the OAuth CSRF state cookie (must be distinct from every other Clover secret)

