import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Cause, Data, Effect, Exit, Layer, Option } from "effect";
import { Clock, staticClock } from "@forest-city-vault/core-clock";
import { provideSagaScoped, withSaga } from "@forest-city-vault/platform-saga";
import { StoreAccount, StoreMembership } from "@forest-city-vault/domain";
import { Database } from "../index";
import { RepositoriesLive, RepositoriesSagaScoped } from "./index";
import { StoreMembershipQueries } from "./store-memberships";
import * as schema from "../schema";
import { DatabaseTest } from "../testing";

const { stores, storeMemberships, aggregateEvents } = schema;

const NOW = new Date("2024-01-02T03:04:05.000Z");

class BoomError extends Data.TaggedError("BoomError")<{ why: string }> {}

/** Services the pooled stack provides (repos + event store/tracker). */
type RepoLive = Layer.Layer.Success<typeof RepositoriesLive>;
/** Services the saga-scoped stack provides, rebuilt per saga by `withSaga`. */
type RepoScoped = Layer.Layer.Success<typeof RepositoriesSagaScoped>;

/** Runs an effect against the pooled repositories on a fresh in-memory db. */
function runPooled<A>(
  effect: Effect.Effect<A, unknown, RepoLive | Clock | Database>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(RepositoriesLive),
      Effect.provide(staticClock(NOW)),
      Effect.provide(DatabaseTest),
    ) as Effect.Effect<A, never, never>,
  );
}

/** Runs an effect against the saga-scoped repositories on a fresh db. */
function runScoped<A>(
  effect: Effect.Effect<A, unknown, RepoScoped | Clock>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(provideSagaScoped(RepositoriesSagaScoped)),
      Effect.provide(staticClock(NOW)),
      Effect.provide(DatabaseTest),
    ) as Effect.Effect<A, never, never>,
  );
}

const makeStore = (storeId: string, name = "Forest City Vault") =>
  Effect.gen(function* () {
    const store = yield* StoreAccount.actions.create(
      StoreAccount.pristine(storeId),
      { name, timeZone: "America/Detroit" },
    );
    yield* StoreAccount.repository.save(store);
    return store;
  });

const makeMembership = (
  membershipId: string,
  storeId: string,
  userId: string,
  role: "owner" | "manager" | "inventory" | "finance" | "readOnly" = "owner",
  email = "owner@example.com",
) =>
  Effect.gen(function* () {
    const membership = yield* StoreMembership.actions.create(
      StoreMembership.pristine(membershipId),
      { storeId, userId, email, role },
    );
    yield* StoreMembership.repository.save(membership);
    return membership;
  });

describe("StoreAccount repository (pooled)", () => {
  test("saves a store and reloads the same snapshot", async () => {
    const storeId = crypto.randomUUID();

    const reloaded = await runPooled(
      Effect.gen(function* () {
        yield* makeStore(storeId, "  Trimmed Name  ");
        return yield* StoreAccount.repository.getById(
          StoreAccount.pristine(storeId).id,
        );
      }),
    );

    assert.equal(reloaded.snapshot.name, "Trimmed Name");
    assert.equal(reloaded.snapshot.status, "active");
    assert.equal(reloaded.snapshot.currency, "USD");
    assert.equal(reloaded.snapshot.timeZone, "America/Detroit");
    assert.equal(reloaded.version, 1);
  });

  test("persists the StoreCreated event to the event stream", async () => {
    const storeId = crypto.randomUUID();

    const events = await runPooled(
      Effect.gen(function* () {
        yield* makeStore(storeId);
        const db = yield* Database;
        return yield* db.query((sql) => sql.select().from(aggregateEvents));
      }),
    );

    const storeEvents = events.filter(
      (row) => row.aggregateType === "StoreAccount",
    );
    assert.equal(storeEvents.length, 1);
    assert.equal(storeEvents[0].eventType, "StoreCreated");
    assert.equal(storeEvents[0].aggregateId, storeId);
  });
});

describe("StoreMembership repository (pooled)", () => {
  test("saves a membership and reloads the same snapshot", async () => {
    const storeId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    const reloaded = await runPooled(
      Effect.gen(function* () {
        yield* makeStore(storeId);
        yield* makeMembership(membershipId, storeId, userId, "manager");
        return yield* StoreMembership.repository.getById(
          StoreMembership.pristine(membershipId).id,
        );
      }),
    );

    assert.equal(reloaded.snapshot.storeId, storeId);
    assert.equal(reloaded.snapshot.userId, userId);
    assert.equal(reloaded.snapshot.role, "manager");
    assert.equal(reloaded.snapshot.status, "active");
  });

  test("findByStoreAndUser returns the membership, or None when absent", async () => {
    const storeId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    const { found, missing } = await runPooled(
      Effect.gen(function* () {
        yield* makeStore(storeId);
        yield* makeMembership(membershipId, storeId, userId);
        const found = yield* StoreMembershipQueries.findByStoreAndUser(
          storeId,
          userId,
        );
        const missing = yield* StoreMembershipQueries.findByStoreAndUser(
          storeId,
          crypto.randomUUID(),
        );
        return { found, missing };
      }),
    );

    assert.ok(Option.isSome(found));
    assert.equal(String(found.value.id), membershipId);
    assert.ok(Option.isNone(missing));
  });

  test("enforces the unique (storeId, userId) constraint", async () => {
    const storeId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* makeStore(storeId);
        yield* makeMembership(crypto.randomUUID(), storeId, userId, "owner");
        // Second membership for the same (store, user) must be rejected.
        yield* makeMembership(crypto.randomUUID(), storeId, userId, "manager");
      }).pipe(
        Effect.provide(RepositoriesLive),
        Effect.provide(staticClock(NOW)),
        Effect.provide(DatabaseTest),
        Effect.exit,
      ) as Effect.Effect<Exit.Exit<void, unknown>, never, never>,
    );

    assert.ok(Exit.isFailure(exit), "the duplicate membership should fail");
  });

  test("countActiveOwners counts only active owners", async () => {
    const storeId = crypto.randomUUID();

    const count = await runPooled(
      Effect.gen(function* () {
        yield* makeStore(storeId);
        yield* makeMembership(
          crypto.randomUUID(),
          storeId,
          crypto.randomUUID(),
          "owner",
        );
        yield* makeMembership(
          crypto.randomUUID(),
          storeId,
          crypto.randomUUID(),
          "owner",
        );
        // A manager does not count.
        yield* makeMembership(
          crypto.randomUUID(),
          storeId,
          crypto.randomUUID(),
          "manager",
        );
        // A disabled owner does not count.
        const disabledOwner = yield* makeMembership(
          crypto.randomUUID(),
          storeId,
          crypto.randomUUID(),
          "owner",
        );
        const disabled = yield* StoreMembership.actions.disable(
          disabledOwner,
          undefined,
        );
        yield* StoreMembership.repository.save(disabled);

        return yield* StoreMembershipQueries.countActiveOwners(storeId);
      }),
    );

    assert.equal(count, 2);
  });
});

describe("Store repositories (saga-scoped)", () => {
  test("commits store and membership writes through the saga transaction", async () => {
    const storeId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    const rows = await runScoped(
      Effect.gen(function* () {
        yield* withSaga(
          Effect.gen(function* () {
            yield* makeStore(storeId);
            yield* makeMembership(membershipId, storeId, userId);
          }),
        );

        const db = yield* Database;
        const storeRows = yield* db.query((sql) => sql.select().from(stores));
        const membershipRows = yield* db.query((sql) =>
          sql.select().from(storeMemberships),
        );
        return { storeRows, membershipRows };
      }),
    );

    assert.equal(rows.storeRows.length, 1);
    assert.equal(rows.storeRows[0].id, storeId);
    assert.equal(rows.membershipRows.length, 1);
    assert.equal(rows.membershipRows[0].id, membershipId);
  });

  test("rolls back all writes when the saga fails", async () => {
    const storeId = crypto.randomUUID();

    // Everything runs against a single in-memory database so the read observes
    // the same connection the failed saga wrote (and rolled back) on.
    const { exit, storeRows } = await runScoped(
      Effect.gen(function* () {
        const exit = yield* withSaga(
          Effect.gen(function* () {
            yield* makeStore(storeId);
            return yield* Effect.fail(new BoomError({ why: "nope" }));
          }),
        ).pipe(Effect.exit);

        const db = yield* Database;
        const storeRows = yield* db.query((sql) => sql.select().from(stores));
        return { exit, storeRows };
      }),
    );

    assert.ok(Exit.isFailure(exit), "the saga should fail");
    const error =
      Exit.isFailure(exit) ?
        Option.getOrUndefined(Cause.failureOption(exit.cause))
      : undefined;
    assert.ok(error instanceof BoomError, "original BoomError is preserved");

    // The store write made before the failure was rolled back with the saga.
    assert.equal(storeRows.length, 0);
  });
});
