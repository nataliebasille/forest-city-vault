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
