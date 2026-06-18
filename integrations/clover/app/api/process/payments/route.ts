import { AppRoute } from "@/runtime";
import { Database } from "@forest-city-vault/database";
import { Effect } from "effect";

export const POST = AppRoute.route(() =>
  Effect.gen(function* () {
    const db = yield* Database;

    const eventsToProcess = yield* db.query((sql) =>
      sql.query.cloverEvents.findMany({
        where: (entity, { eq, and }) =>
          and(eq(entity.status, "received"), eq(entity.eventType, "P")),
        orderBy: (entity, { asc }) => asc(entity.receivedAt),
        limit: 100,
        offset: 0,
      }),
    );
  }),
);
