import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Effect, Exit, Layer, Option } from "effect";
import { Database } from "../index";
import { StoreMembershipQueries } from "../repositories/store-memberships";
import * as schema from "../schema";
import { makeDatabaseTestContext } from "../testing";
import {
  bootstrapStore,
  BOOTSTRAP_STORE_ID,
  StoreBootstrapConflictError,
} from "./bootstrap-store";
import { bootstrapOwnerMembership } from "./bootstrap-owner-membership";
import { runBootstrap } from "./runtime";

const { stores } = schema;

/**
 * Builds a database layer backed by a single shared PGlite client, so every
 * command run against it — and the verifying reads — observe the same
 * connection. This is what lets a test assert idempotency: a second run sees the
 * first run's writes.
 */
const freshDatabase = async (): Promise<Layer.Layer<Database>> => {
  const { layer } = await makeDatabaseTestContext();
  return layer;
};

describe("bootstrapStore", () => {
  test("creates the store on first run and is a no-op on the second", async () => {
    const database = await freshDatabase();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* runBootstrap(bootstrapStore(), database);
        const second = yield* runBootstrap(bootstrapStore(), database);

        const db = yield* Database;
        const rows = yield* db.query((sql) => sql.select().from(stores));

        return { first, second, rows };
      }).pipe(Effect.provide(database)),
    );

    assert.equal(result.first.created, true);
    assert.equal(result.first.storeId, BOOTSTRAP_STORE_ID);
    assert.equal(result.second.created, false);
    assert.equal(result.rows.length, 1, "only one store exists after two runs");
    assert.equal(result.rows[0].name, "Forest City Vault");
    assert.equal(result.rows[0].timeZone, "America/Detroit");
    assert.equal(result.rows[0].status, "active");
    assert.equal(result.rows[0].currency, "USD");
  });

  test("refuses to overwrite a different store under the bootstrap identity", async () => {
    const database = await freshDatabase();

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* runBootstrap(bootstrapStore({ name: "Original" }), database);
        return yield* runBootstrap(
          bootstrapStore({ name: "Conflicting" }),
          database,
        ).pipe(Effect.exit);
      }).pipe(Effect.provide(database)),
    );

    assert.ok(Exit.isFailure(exit));
    const error =
      Exit.isFailure(exit) && exit.cause._tag === "Fail" ?
        exit.cause.error
      : undefined;
    assert.ok(error instanceof StoreBootstrapConflictError);
  });
});

describe("bootstrapOwnerMembership", () => {
  test("creates an owner membership once and is idempotent for the same user", async () => {
    const database = await freshDatabase();
    const userId = crypto.randomUUID();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* runBootstrap(bootstrapStore(), database);

        const first = yield* runBootstrap(
          bootstrapOwnerMembership({
            storeId: BOOTSTRAP_STORE_ID,
            userId,
            email: "owner@example.com",
          }),
          database,
        );
        const second = yield* runBootstrap(
          bootstrapOwnerMembership({
            storeId: BOOTSTRAP_STORE_ID,
            userId,
            email: "owner@example.com",
          }),
          database,
        );

        const membership = yield* StoreMembershipQueries.findByStoreAndUser(
          BOOTSTRAP_STORE_ID,
          userId,
        );
        const ownerCount =
          yield* StoreMembershipQueries.countActiveOwners(BOOTSTRAP_STORE_ID);

        return { first, second, membership, ownerCount };
      }).pipe(Effect.provide(database)),
    );

    assert.equal(result.first.created, true);
    assert.equal(result.second.created, false);
    assert.equal(
      result.first.membershipId,
      result.second.membershipId,
      "both runs resolve to the same membership id",
    );
    assert.ok(Option.isSome(result.membership));
    assert.equal(result.ownerCount, 1, "exactly one active owner exists");
  });
});
