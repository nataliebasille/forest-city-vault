# clover-webhooks

Backend-only Next.js service for Clover webhook handling.

## Scripts

- `pnpm dev` - Run local dev server on port 3010
- `pnpm build` - Build for production
- `pnpm start` - Start production server on port 3010
- `pnpm lint` - Lint source

## API Routes

- `GET /api/health` - Health check endpoint
- `POST /api/webhooks/clover` - Clover webhook receiver

## Notes

This app is intentionally backend-only. It only exposes API route handlers under `app/api`.

## Clover auth

Payment processing exchanges `CLOVER_WEBHOOK_AUTH_CODE` for an OAuth access token
using `CLOVER_APP_ID` and `CLOVER_SECRET_CODE` before requesting payment details
from Clover. The token is provided through a shared `CloverAuthToken` service and
cached in-process so Clover operations can reuse it without refetching.

