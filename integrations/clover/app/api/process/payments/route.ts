import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { AppRoute } from "@/runtime";
import { Database, drain } from "@forest-city-vault/database";
import { and, eq } from "drizzle-orm/sql/expressions/conditions";
import { Effect } from "effect";
import { Sales } from "@forest-city-vault/domain";

export const POST = AppRoute.route(() =>
  Effect.gen(function* () {
    yield* drain({
      inbox: "payments",
      requestId: (yield* RequestTrace).requestId,
      action: (sql, message) =>
        Effect.gen(function* () {
          const newSale = Sales.pristine(yield* IdGenerator.next());
        }),
    });
  }),
);
