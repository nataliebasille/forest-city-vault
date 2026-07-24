import { withSaga } from "@forest-city-vault/platform-saga";
import { Effect, Either } from "effect";
import { eq, or } from "drizzle-orm/sql/expressions/conditions";
import * as inboxes from "../../schema/inboxes";
import { Database, DatabaseError, tryDb } from "../..";
import { InboxErrorTable } from "../../schema/inboxes";

type Inbox = {
  [K in keyof typeof inboxes as (typeof inboxes)[K] extends { inbox: any } ? K
  : never]: (typeof inboxes)[K];
};

type InboxKeys = keyof Inbox;

const MAX_ATTEMPTS = 5;

/**
 * Processes up to 30 `received` or `failed` items from an inbox, running each one
 * as its own saga.
 *
 * Every message is a self-contained unit of work:
 *
 * - The `action` and the inbox's `processed` status update run **inside one
 *   saga** ({@link withSaga}), on the saga's transaction-bound {@link Database}.
 *   They commit together or roll back together, so a message is only ever marked
 *   processed when all of its side effects (the sale, its events, …) were
 *   durably written. Messages are independent: one failing does not roll back
 *   another that already committed.
 * - When the saga fails, dies or cannot commit, its writes are rolled back and
 *   the item stays `received`. The failure is then recorded **outside the saga**
 *   on the base pool {@link Database} — a separate transaction that commits even
 *   though the message rolled back — bumping the attempt count and flipping the
 *   item to `failed` (or `dead_letter` at {@link MAX_ATTEMPTS}). This is what
 *   guarantees an unprocessed message's error is never lost to the rollback.
 *
 * The per-message saga's scoped services (the transaction-bound {@link Database}
 * the `action` and the processed-update run on, plus whatever repositories or
 * event store the `action` uses) are **not** passed in here. They are declared
 * once at the boundary via `provideSagaScoped`, and {@link withSaga} rebuilds
 * them fresh for each message — so every message gets its own transaction.
 * `drain` only names the base pool {@link Database} it needs to load the batch
 * and record failures on.
 *
 * Any request-scoped services the `action` needs that are *not* saga-scoped
 * (an HTTP client, config, …) are left in the returned effect's requirements
 * and satisfied by the surrounding request context.
 */
export function drain<I extends InboxKeys, RAction, A, E>(opt: {
  inbox: I;
  requestId: string;
  action: (
    message: Inbox[I]["inbox"]["$inferSelect"],
  ) => Effect.Effect<A, E, RAction>;
}) {
  const { inbox: inboxKey, requestId, action } = opt;
  return Effect.gen(function* () {
    const db = yield* Database;

    const { inbox, errors } = db.schema.inboxes[inboxKey];

    const toProcess = yield* db.query((sql) =>
      sql
        .select()
        .from(inbox)
        .where(or(eq(inbox.status, "received"), eq(inbox.status, "failed")))
        .orderBy(inbox.receivedAt)
        .limit(30),
    );

    yield* Effect.logInfo("inbox.drain.batch.loaded", {
      inbox: inboxKey,
      requestId,
      batchSize: toProcess.length,
      workflowStage: "load_batch",
    });

    const processed = yield* Effect.forEach(toProcess, (item) =>
      Effect.gen(function* () {
        const attemptNumber = item.attempts + 1;

        yield* Effect.logInfo("inbox.message.processing.started", {
          inbox: inboxKey,
          requestId,
          inboxId: String(item.id),
          idempotencyKey: item.idempotencyKey,
          providerEventId: item.providerEventId,
          providerObjectId: item.providerObjectId,
          attemptNumber,
          workflowStage: "process_message",
        });

        // Run the message as a saga: the action plus the `processed` status
        // update commit or roll back atomically on the saga's transaction. The
        // saga-scoped services are rebuilt per message by `withSaga`.
        const outcome = yield* withSaga(
          Effect.gen(function* () {
            const value = yield* action(item);

            const txDb = yield* Database;
            yield* txDb.query((sql) =>
              sql
                .update(inbox)
                .set({ status: "processed", attempts: attemptNumber })
                .where(eq(inbox.id, item.id)),
            );

            return value;
          }),
        ).pipe(Effect.either);

        if (Either.isRight(outcome)) {
          item.attempts = attemptNumber;
          item.status = "processed";

          yield* Effect.logInfo("inbox.message.processing.succeeded", {
            inbox: inboxKey,
            requestId,
            inboxId: String(item.id),
            idempotencyKey: item.idempotencyKey,
            providerEventId: item.providerEventId,
            providerObjectId: item.providerObjectId,
            attemptNumber,
            status: item.status,
          });

          return { id: item.id, status: item.status };
        }

        // The saga rolled back: record the failure on the base pool so it
        // survives the rollback, and flip the item to failed / dead_letter.
        const status = attemptNumber >= MAX_ATTEMPTS ? "dead_letter" : "failed";
        item.attempts = attemptNumber;
        item.status = status;

        const error = {
          inboxId: item.id,
          requestId,
          attemptNumber,
          error: serializeError(
            outcome.left instanceof DatabaseError ?
              outcome.left.cause
            : outcome.left,
          ),
        } satisfies InboxErrorTable["$inferInsert"];

        yield* db.transaction((sql) =>
          Effect.gen(function* () {
            yield* tryDb(() => sql.insert(errors).values([error]));
            yield* tryDb(() =>
              sql
                .update(inbox)
                .set({ status, attempts: attemptNumber })
                .where(eq(inbox.id, item.id)),
            );
          }),
        );

        yield* Effect.logWarning("inbox.message.processing.failed", {
          inbox: inboxKey,
          requestId,
          inboxId: String(item.id),
          idempotencyKey: item.idempotencyKey,
          providerEventId: item.providerEventId,
          providerObjectId: item.providerObjectId,
          attemptNumber,
          maxAttempts: MAX_ATTEMPTS,
          status,
          failureDisposition: status === "dead_letter" ? "terminal" : "retryable",
          error: toSafeErrorDetails(outcome.left),
        });

        return { id: item.id, status };
      }),
    );

    yield* Effect.logInfo("inbox.drain.batch.completed", {
      inbox: inboxKey,
      requestId,
      processedCount: processed.length,
      workflowStage: "complete_batch",
    });

    return processed;
  });
}

function serializeError(error: unknown) {
  try {
    return JSON.stringify(error, createErrorReplacer());
  } catch {
    return JSON.stringify({
      type: typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function createErrorReplacer() {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown): unknown => {
    if (typeof value === "bigint") {
      return value.toString();
    }

    if (typeof value !== "object" || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        cause: value.cause,
        ...Object.fromEntries(Object.entries(value)),
      };
    }

    return value;
  };
}

function toSafeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === "object" && error !== null && "_tag" in error) {
    return {
      tag: String((error as { _tag?: unknown })._tag),
    };
  }

  return {
    type: typeof error,
  };
}
