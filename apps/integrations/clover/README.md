# clover-webhooks

Backend-only Next.js service for Clover OAuth, webhook intake, and order-grained ingestion.

## Scripts

- `pnpm dev`
- `pnpm import:schedule`
- `pnpm orders:run`
- `pnpm orders:backfill`
- `pnpm vendor-items:run`

## Internal routes

- `POST /api/import/orders`
- `POST /api/process/orders`
- `POST /api/import/vendor-items`
- `POST /api/process/vendor-items`
- `POST /api/webhooks/clover`

All internal processor/import routes require `Authorization: Bearer <CLOVER_PROCESSOR_SECRET>`.
