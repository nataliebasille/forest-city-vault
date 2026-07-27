import { StoreAccount } from "@forest-city-vault/domain";
import { Data, Effect } from "effect";

/**
 * The stable identity of the single Forest City Vault store. Bootstrap always
 * creates/looks up the store under this fixed id, which is what makes the
 * command idempotent: a re-run finds the existing store rather than minting a
 * second one.
 */
export const BOOTSTRAP_STORE_ID = "01920000-0000-7000-8000-000000000001";

export const DEFAULT_STORE_NAME = "Forest City Vault";
export const DEFAULT_STORE_TIME_ZONE = "America/Detroit";

/**
 * A store already exists under {@link BOOTSTRAP_STORE_ID} but does not match the
 * store bootstrap is trying to establish. Raised instead of silently
 * overwriting or creating a conflicting second store under the same stable
 * identity.
 */
export class StoreBootstrapConflictError extends Data.TaggedError(
  "infrastructure/bootstrap/StoreBootstrapConflictError",
)<{ readonly storeId: string; readonly reason: string }> {}

export type BootstrapStoreInput = {
  readonly name?: string;
  readonly timeZone?: string;
};

export type BootstrapStoreResult = {
  readonly storeId: string;
  readonly created: boolean;
};

/**
 * Ensures the initial store exists, idempotently.
 *
 * - No store under {@link BOOTSTRAP_STORE_ID} → create it (active, USD) via the
 *   `StoreAccount` aggregate and repository, returning `created: true`.
 * - A matching store already exists → no-op, returning `created: false`.
 * - A *different* store already occupies the id → fail with
 *   {@link StoreBootstrapConflictError} rather than clobber it.
 *
 * The caller is responsible for the transaction (bootstrap runs inside
 * `withSaga`), so the create's snapshot write and event append commit together.
 */
export const bootstrapStore = (input: BootstrapStoreInput = {}) =>
  Effect.gen(function* () {
    const pristine = StoreAccount.pristine(BOOTSTRAP_STORE_ID);
    const name = (input.name ?? DEFAULT_STORE_NAME).trim();
    const timeZone = (input.timeZone ?? DEFAULT_STORE_TIME_ZONE).trim();

    const existing = yield* StoreAccount.repository.getById(pristine.id).pipe(
      Effect.asSome,
      Effect.catchTag(
        "core/domain/Repository/AggregateNotFoundError",
        () => Effect.succeedNone,
      ),
    );

    if (existing._tag === "Some") {
      if (existing.value.snapshot.name !== name) {
        return yield* Effect.fail(
          new StoreBootstrapConflictError({
            storeId: BOOTSTRAP_STORE_ID,
            reason: `a different store ("${existing.value.snapshot.name}") already exists under the bootstrap identity`,
          }),
        );
      }

      return {
        storeId: BOOTSTRAP_STORE_ID,
        created: false,
      } satisfies BootstrapStoreResult;
    }

    const created = yield* StoreAccount.actions.create(pristine, {
      name,
      timeZone,
    });

    yield* StoreAccount.repository.save(created);

    return {
      storeId: BOOTSTRAP_STORE_ID,
      created: true,
    } satisfies BootstrapStoreResult;
  });
