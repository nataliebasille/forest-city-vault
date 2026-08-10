// scripts/generate-migration.ts
//
// Wrapper around `drizzle-kit generate` that REFUSES to run unless a meaningful
// migration name is supplied. Left to its own devices, `drizzle-kit generate`
// invents a random name like `0008_serious_clea`, which tells a future reader
// nothing about what the migration does. This guard makes an unnamed migration
// impossible: no name, no migration.
//
// Usage:
//   pnpm db:generate --name add_vendor_items
//   pnpm db:generate:migration --name require_sale_line_item_clover_item_id
//
// The name must be snake_case-ish and descriptive (letters/digits/underscores,
// starting with a letter), so single throwaway words are rejected too.
import { spawnSync } from "node:child_process";

const MIN_WORDS = 2;
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

const name = parseName(process.argv.slice(2));

if (name === undefined) {
  fail(
    "A migration name is required. Pass one with --name, e.g.\n" +
      "  pnpm db:generate --name add_vendor_items",
  );
}

if (!NAME_PATTERN.test(name) || name.split("_").length < MIN_WORDS) {
  fail(
    `Migration name "${name}" is not descriptive enough.\n` +
      "Use lower_snake_case with at least two words describing the change, e.g.\n" +
      "  require_sale_line_item_clover_item_id",
  );
}

const result = spawnSync("drizzle-kit", ["generate", `--name=${name}`], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);

function parseName(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--name") return args[i + 1];
    if (arg.startsWith("--name=")) return arg.slice("--name=".length);
  }
  return undefined;
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
