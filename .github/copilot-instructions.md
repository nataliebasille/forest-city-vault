# Repository coding conventions

## Code organization

- **Put exported declarations at the top of a module and internal (non-exported)
  helpers below them.** In a file, exported symbols (types, constants, the main
  function/action, etc.) come first so a reader sees the public surface up front;
  module-private functions and helper constants they rely on are written
  underneath the exported code. This works because function declarations hoist,
  and helper constants are only referenced from within functions invoked at call
  time.

## Types

- **Let return types be inferred; do not annotate them unless absolutely
  necessary.** New functions (including exported ones and those returning
  `Effect`s or `Promise`s) should rely on TypeScript's inference for their return
  type rather than carrying an explicit annotation — an inferred type stays
  correct as the body evolves and avoids widening (e.g. writing
  `Effect.Effect<unknown, E>` when the real success type is more precise). Only
  add an explicit return type when inference genuinely cannot express the intent
  or is required to break a circular/recursive inference — and when you do, treat
  it as the exception, not the default. Parameter types are unaffected: annotate
  those as usual.

## Database migrations

- **Never generate a migration without a meaningful name.** Bare
  `drizzle-kit generate` invents a random tag (e.g. `0008_serious_clea`) that
  tells a reader nothing. Always name migrations after the change they make, in
  lower_snake_case with at least two words (e.g.
  `require_sale_line_item_clover_item_id`, `add_vendor_items`). Generate them via
  `pnpm db:generate --name <descriptive_name>` (or
  `pnpm db:generate:migration --name <descriptive_name>`) — the
  `scripts/generate-migration.ts` guard **refuses** to run without such a name,
  so migrations can only be created with one. If a random-named `.sql` ever slips
  in, rename the file and its `drizzle/meta/_journal.json` tag to a meaningful
  name before committing.

## Environment variables

- **This project uses `.env`, not `.env.local`.** Local configuration and secrets
  go in a `.env` file (the repo root `.env` is the canonical one; `.env.example`
  documents the required keys). Do not create or reference `.env.local` — reach
  for `.env` when instructing how to configure or test locally. `.env*` is
  gitignored (except `.env.example`).
