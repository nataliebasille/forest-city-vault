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
 * Provisions the initial owner from an email alone, e.g.
 *   tsx scripts/bootstrap-owner-membership.ts <email> [storeId]
 * or via BOOTSTRAP_OWNER_EMAIL / BOOTSTRAP_STORE_ID.
 *
 * The membership is keyed by email, which is the admin portal's auth gate key:
 * on first sign-in Better Auth proves ownership of this email and provisions its
 * own auth-user row, while access is granted by this membership. No auth user is
 * created here — the identity provider handles that on first login. Refuses to
 * run without an email; the initial membership is never created implicitly.
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

const program = runBootstrap(
  bootstrapOwnerMembership({ storeId, email }),
  DatabaseLive.pipe(Layer.orDie),
).pipe(
  Effect.tap((result) =>
    Effect.sync(() =>
      console.log(
        result.created ?
          `Created owner membership ${result.membershipId} for ${email} in store ${storeId}.`
        : `Owner membership ${result.membershipId} already exists for ${email} in store ${storeId}; nothing to do.`,
      ),
    ),
  ),
);

await Effect.runPromise(program);
