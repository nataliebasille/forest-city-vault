# clover-webhooks

Backend-only Next.js service for Clover webhook handling.

## Scripts

- `pnpm dev` - Run local dev server on port 3010
- `pnpm build` - Build for production
- `pnpm start` - Start production server on port 3010
- `pnpm lint` - Lint source

## API Routes

- `GET /api/health` - Health check endpoint
- `GET /api/oauth/callback` - Clover OAuth callback (captures per-merchant tokens)
- `POST /api/webhooks/clover` - Clover webhook receiver

## Notes

This app is intentionally backend-only. It only exposes API route handlers under `app/api`.

## Clover auth

Clover uses a per-merchant OAuth 2.0 authorization-code flow. Access tokens are
scoped to a single merchant and expire, so there is no single global token.

Flow:

1. A merchant installs/authorizes the app. Clover redirects the merchant to this
   app's **Site URL**, which is registered as `/api/oauth/callback`, with
   `merchant_id` and a single-use authorization `code`.
2. `GET /api/oauth/callback` exchanges that `code` at `POST /oauth/v2/token`
   (using `CLOVER_APP_ID` and `CLOVER_SECRET_CODE`) for an `access_token` /
   `refresh_token` pair and persists it, **encrypted at rest**, in
   `fcv_clover_merchant_tokens` (keyed by `merchant_id`).
3. Payment processing (`POST /api/process/payments`) resolves the merchant's
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
- `CLOVER_URL` - Clover API base URL (e.g. `https://apisandbox.dev.clover.com`)
- `CLOVER_WEBHOOK_AUTH_CODE` - shared secret for verifying webhook `x-clover-auth`
- `CLOVER_TOKEN_ENCRYPTION_KEY` - secret used to encrypt stored OAuth tokens

