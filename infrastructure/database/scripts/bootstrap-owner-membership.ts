import { loadEnvFile } from "node:process";

try {
  loadEnvFile("../../.env");
} catch {}

import { ensureAuthUser } from "@forest-city-vault/core-auth";
import { Effect, Layer } from "effect";
import { DatabaseLive } from "../src/database";
import { runBootstrap } from "../src/bootstrap/runtime";
import { bootstrapOwnerMembership } from "../src/bootstrap/bootstrap-owner-membership";
import { BOOTSTRAP_STORE_ID } from "../src/bootstrap/bootstrap-store";

/**
 * Provisions the initial owner from an email alone, e.g.
 *   tsx scripts/bootstrap-owner-membership.ts <email> [storeId]
 * or via BOOTSTRAP_OWNER_EMAIL / BOOTSTRAP_STORE_ID.
 *
 * The flow is `ensureAuthUser(email)` → `bootstrapOwnerMembership`: the Supabase
 * auth user is created (or reused, idempotently) here, and its id — never typed
 * by hand — is handed to the Supabase-free database bootstrap. Refuses to run
 * without an email; the initial membership is never created implicitly.
 */
const [, , emailArg, storeIdArg] = process.argv;

const email = emailArg ?? process.env.BOOTSTRAP_OWNER_EMAIL;
const storeId =
  storeIdArg ?? process.env.BOOTSTRAP_STORE_ID ?? BOOTSTRAP_STORE_ID;

if (!email) {
  console.error(
    "Usage: tsx scripts/bootstrap-owner-membership.ts <email> [storeId]",
  );
  process.exit(1);
}

const program = Effect.gen(function* () {
  const userId = yield* ensureAuthUser(email);

  const result = yield* runBootstrap(
    bootstrapOwnerMembership({ storeId, userId, email }),
    DatabaseLive.pipe(Layer.orDie),
  );

  return { userId, result };
}).pipe(
  Effect.tap(({ userId, result }) =>
    Effect.sync(() =>
      console.log(
        result.created ?
          `Created owner membership ${result.membershipId} for user ${userId} (${email}) in store ${storeId}.`
        : `Owner membership ${result.membershipId} already exists for user ${userId} (${email}) in store ${storeId}; nothing to do.`,
      ),
    ),
  ),
);

await Effect.runPromise(program);
