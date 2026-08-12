import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({
  path: path.resolve(__dirname, "../../../../.env.production"),
  override: false,
});

import { Cause, Config, Effect, Exit } from "effect";
import { inspect } from "node:util";
import { eq, or } from "drizzle-orm";

import { CloverConfig } from "@forest-city-vault/core-config";
import { Database } from "@forest-city-vault/infrastructure-database";
import { importOrders, processOrders } from "../lib/jobs/orders";
import { JobLive } from "../lib/runtime/live";

const DEFAULT_MAX_CYCLES = 10_000;

const program = Effect.gen(function* () {
  const { merchantId } = yield* CloverConfig;
  const maxCycles = yield* Config.integer("CLOVER_REBUILD_MAX_CYCLES").pipe(
    Config.withDefault(DEFAULT_MAX_CYCLES),
  );

  yield* Effect.logInfo("clover.orders.rebuild.reset.begin", { merchantId });
  yield* resetOrderModel();
  yield* Effect.logInfo("clover.orders.rebuild.reset.completed", { merchantId });

  let cycles = 0;
  while (cycles < maxCycles) {
    const requestId = `rebuild-${cycles}-${randomUUID()}`;
    const summary = yield* importOrders({ requestId });
    const processed = yield* processOrders({ requestId });

    yield* Effect.logInfo("clover.orders.rebuild.cycle", {
      requestId,
      cycle: cycles,
      listed: summary.listed,
      enqueued: summary.enqueued,
      processed,
      watermark: summary.newWatermark,
    });

    cycles += 1;
    if (summary.enqueued === 0 && processed === 0) {
      break;
    }
  }

  if (cycles >= maxCycles) {
    return yield* Effect.fail(
      new Error(
        `Order rebuild reached max cycles (${maxCycles}) before draining cleanly`,
      ),
    );
  }
});

const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(JobLive)));

if (Exit.isFailure(exit)) {
  console.error(`[orders-backfill ${new Date().toISOString()}] backfill failed`);
  console.error(Cause.pretty(exit.cause));
  console.error(inspect(exit.cause, { depth: 12, colors: false }));
  process.exit(1);
}

console.log(`[orders-backfill ${new Date().toISOString()}] backfill completed`);

function resetOrderModel() {
  return Effect.gen(function* () {
    const db = yield* Database;
    const {
      aggregateEvents,
      cloverImportCursors,
      orderLineItems,
      orderPayments,
      orders,
      inboxes,
    } = db.schema;

    yield* db.transaction((sql) =>
      Effect.gen(function* () {
        yield* sql.delete(inboxes.orders.errors);
        yield* sql.delete(inboxes.orders.inbox);
        yield* sql.delete(orderPayments);
        yield* sql.delete(orderLineItems);
        yield* sql.delete(orders);
        yield* sql
          .delete(aggregateEvents)
          .where(
            or(
              eq(aggregateEvents.aggregateType, "Sale"),
              eq(aggregateEvents.aggregateType, "Order"),
            ),
          );
        yield* sql
          .delete(cloverImportCursors)
          .where(eq(cloverImportCursors.entityType, "order"));
      }),
    );
  });
}
