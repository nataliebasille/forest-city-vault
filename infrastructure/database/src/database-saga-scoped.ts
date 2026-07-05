import { sagaScoped } from "@forest-city-vault/application-core";
import { Effect } from "effect";
import { Database } from "./database";

/**
 * Makes the {@link Database} take part in the current saga.
 *
 * This is the database expressed as an ordinary scoped service through the
 * application-owned `sagaScoped`/`Saga` abstraction — nothing about it is
 * special-cased by the application. Providing this layer over an effect that
 * runs inside `withSaga`:
 *
 * - opens one transaction and provides a transaction-bound {@link Database} for
 *   the scope, so repositories, the event store and ad-hoc queries obtained via
 *   the `Database` tag all run on the same transaction and commit or roll back
 *   together; and
 * - registers that transaction's commit/rollback as a participant, so the
 *   surrounding `withSaga` drives finalization once the whole saga has settled
 *   (a commit failure surfaces as a `SagaError`).
 *
 * A future non-database participant (e.g. an event broker) plugs in exactly the
 * same way via `sagaScoped`, so the application never learns that persistence is
 * a database. This layer lives in infrastructure and depends inward on the
 * application abstraction, keeping the dependency flow
 * domain → application → infrastructure intact.
 */
export const databaseSagaScoped = sagaScoped(
  Database,
  Effect.gen(function* () {
    const database = yield* Database;
    const transaction = yield* database.beginTransaction;

    return {
      service: transaction.database,
      commit: transaction.commit,
      rollback: transaction.rollback,
    };
  }),
);
