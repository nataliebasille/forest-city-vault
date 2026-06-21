import { Effect, Either } from "effect";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import * as inboxes from "../../schema/inboxes";
import { Database, DatabaseError, tryDb, type SapphoDatabase } from "../..";
import { InboxErrorTable } from "../../schema/inboxes";

type Inbox = {
  [K in keyof typeof inboxes as (typeof inboxes)[K] extends { inbox: any }
    ? K
    : never]: (typeof inboxes)[K];
};

type InboxKeys = keyof Inbox;

const MAX_ATTEMPTS = 5;

export function drain<I extends InboxKeys, A, E, R>(opt: {
  inbox: I;
  requestId: string;
  action: (
    sql: SapphoDatabase,
    message: Inbox[I]["inbox"]["$inferSelect"],
  ) => Effect.Effect<A, E, R>;
}) {
  const { inbox: inboxKey, requestId, action } = opt;
  return Effect.gen(function* () {
    const db = yield* Database;

    const { inbox, errors } = db.schema.inboxes[inboxKey];

    const toProcess = yield* db.query((sql) =>
      sql
        .select()
        .from(inbox)
        .where(eq(inbox.status, "received"))
        .orderBy(inbox.receivedAt)
        .limit(30),
    );

    return yield* Effect.forEach(toProcess, (item) =>
      Effect.gen(function* () {
        const result = yield* db
          .transaction((sql) => action(sql, item))
          .pipe(Effect.either);

        const attemptNumber = ++item.attempts;
        item.attempts = attemptNumber;

        if (Either.isLeft(result)) {
          item.status =
            attemptNumber >= MAX_ATTEMPTS ? "dead_letter" : "failed";

          const error = {
            inboxId: item.id,
            requestId,
            attemptNumber,
            error: serializeError(
            result.left instanceof DatabaseError
              ? result.left.cause
              : result.left,
          ),
          } satisfies InboxErrorTable["$inferInsert"];

          yield* db.transaction((sql) =>
            Effect.gen(function* () {
              yield* tryDb(() => sql.insert(errors).values([error]));
              yield* tryDb(() =>
                sql
                  .update(inbox)
                  .set({ status: item.status, attempts: item.attempts })
                  .where(eq(inbox.id, item.id)),
              );
            }),
          );
        } else {
          item.status = "processed";

          yield* db.transaction((sql) =>
            tryDb(() =>
              sql
                .update(inbox)
                .set({ status: item.status, attempts: item.attempts })
                .where(eq(inbox.id, item.id)),
            ),
          );
        }
      }),
    );
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
