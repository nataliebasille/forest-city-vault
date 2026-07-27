import { loadEnvFile } from "node:process";

try {
  loadEnvFile("../../.env");
} catch {}

import { Effect, Layer } from "effect";
import { DatabaseLive } from "../src/database";
import { runBootstrap } from "../src/bootstrap/runtime";
import { bootstrapOwnerMembership } from "../src/bootstrap/bootstrap-owner-membership";
import { BOOTSTRAP_STORE_ID } from "../src/bootstrap/bootstrap-store";

/**
 * Reads the owner membership inputs from CLI args or environment, e.g.
 *   tsx scripts/bootstrap-owner-membership.ts <userId> <email> [storeId]
 * or via BOOTSTRAP_OWNER_USER_ID / BOOTSTRAP_OWNER_EMAIL / BOOTSTRAP_STORE_ID.
 *
 * Refuses to run without a Supabase user id and email — the initial membership
 * is never created implicitly.
 */
const [, , userIdArg, emailArg, storeIdArg] = process.argv;

const userId = userIdArg ?? process.env.BOOTSTRAP_OWNER_USER_ID;
const email = emailArg ?? process.env.BOOTSTRAP_OWNER_EMAIL;
const storeId =
  storeIdArg ?? process.env.BOOTSTRAP_STORE_ID ?? BOOTSTRAP_STORE_ID;

if (!userId || !email) {
  console.error(
    "Usage: tsx scripts/bootstrap-owner-membership.ts <supabaseUserId> <email> [storeId]",
  );
  process.exit(1);
}

const program = runBootstrap(
  bootstrapOwnerMembership({ storeId, userId, email }),
  DatabaseLive.pipe(Layer.orDie),
).pipe(
  Effect.tap((result) =>
    Effect.sync(() =>
      console.log(
        result.created ?
          `Created owner membership ${result.membershipId} for user ${userId} in store ${storeId}.`
        : `Owner membership ${result.membershipId} already exists for user ${userId} in store ${storeId}; nothing to do.`,
      ),
    ),
  ),
);

await Effect.runPromise(program);
