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
scoped to a single merchant and expire, so there is no single global token.

Flow:

1. A merchant launches the app. Clover redirects the merchant to this app's
   **Site URL**, which is registered as `/api/oauth/callback`. On the initial
   launch (or for an unauthorized merchant) Clover sends only `merchant_id` and
   `client_id` — **no `code`**.
2. When no `code` is present, `GET /api/oauth/callback` responds with a `302`
   redirect to Clover's `/oauth/v2/authorize` endpoint (passing `client_id`,
   `response_type=code`, and `merchant_id`). Clover authorizes the merchant and
   then redirects them **back to the same callback with a single-use `code`**.
   The authorize endpoint is on Clover's **merchant-facing web host**
   (`CLOVER_OAUTH_URL`, e.g. `sandbox.dev.clover.com`) — a different host from
   the API host used for token exchange/refresh (`CLOVER_URL`, e.g.
   `apisandbox.dev.clover.com`). Pointing authorize at the API host bounces the
   merchant back to login in a loop.
3. With a `code` present, `GET /api/oauth/callback` exchanges it at
   `POST /oauth/v2/token` (using `CLOVER_APP_ID` and `CLOVER_SECRET_CODE`) for an
   `access_token` / `refresh_token` pair and persists it, **encrypted at rest**,
   in `fcv_clover_merchant_tokens` (keyed by `merchant_id`).
4. Payment processing (`POST /api/process/payments`) resolves the merchant's
   token via `getMerchantAccessToken(merchantId)`: it returns the stored access
   token, transparently refreshing it at `POST /oauth/v2/refresh` when expired.
   If the merchant has no token, or the refresh token has expired, processing
   fails terminally and the merchant must (re)authorize.

Tokens are encrypted with AES-256-GCM using a key derived from
`CLOVER_TOKEN_ENCRYPTION_KEY`; only ciphertext is stored in the database.

`CLOVER_WEBHOOK_AUTH_CODE` is unrelated to OAuth — it is only used to verify the
`x-clover-auth` header on inbound webhooks.

### Environment variables

- `CLOVER_APP_ID` - Clover app / client id
- `CLOVER_SECRET_CODE` - Clover app / client secret
- `CLOVER_URL` - Clover API base URL for token exchange/refresh (e.g. `https://apisandbox.dev.clover.com`)
- `CLOVER_OAUTH_URL` - Clover merchant-facing web host for the OAuth authorize/login step (e.g. `https://sandbox.dev.clover.com`)
- `CLOVER_WEBHOOK_AUTH_CODE` - shared secret for verifying webhook `x-clover-auth`
- `CLOVER_TOKEN_ENCRYPTION_KEY` - secret used to encrypt stored OAuth tokens

