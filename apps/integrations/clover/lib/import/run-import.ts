import { Clock, now } from "@forest-city-vault/core-clock";
import {
  CloverImportCursorRepository,
  Database,
} from "@forest-city-vault/infrastructure-database";
import { Effect, Option } from "effect";
import type { ImportSource } from "./import-source";

export type ImportSummary = {
  readonly entityType: string;
  readonly merchantId: string;
  /** Watermark the run started from (epoch ms); `0` means a full backfill. */
  readonly startTimestamp: number;
  /** Watermark the cursor was advanced to (epoch ms). */
  readonly newWatermark: number;
  /** Total elements listed from Clover across all pages this run. */
  readonly listed: number;
  /** Rows newly inserted into the inbox (excludes idempotent duplicates). */
  readonly enqueued: number;
  /** Pages fetched from Clover this run. */
  readonly pages: number;
};

// Safety bound so a runaway/misordered provider response can never loop forever
// within a single request. At `pageSize` 50 this covers 5000 records per run;
// larger backlogs simply continue on the next scheduled run from the advanced
// watermark.
const MAX_PAGES = 100;

/**
 * Runs one incremental import for a single entity stream.
 *
 * Reads the stream's watermark, asks Clover only for records at/after it
 * (ascending, inclusive), enqueues each page into the entity's inbox, and
 * advances the watermark to the newest timestamp seen. The inclusive `>=`
 * boundary re-includes the last record(s) so nothing is skipped when timestamps
 * tie; the source's idempotent enqueue absorbs that overlap.
 *
 * The cursor is advanced only after the pages were enqueued, so a mid-run
 * failure leaves the watermark untouched and the next run safely reprocesses
 * from the same point (again idempotently).
 */
export function runImport<Element, R>(
  source: ImportSource<Element, R>,
  options: {
    readonly merchantId: string;
    readonly requestId: string;
    readonly pageSize: number;
  },
): Effect.Effect<ImportSummary, unknown, R | Database | Clock> {
  return Effect.gen(function* () {
    const { merchantId, requestId, pageSize } = options;
    const { entityType } = source;

    const cursor = yield* CloverImportCursorRepository.get(
      merchantId,
      entityType,
    );
    const startTimestamp = Option.match(cursor, {
      onNone: () => 0,
      onSome: (row) => row.lastTimestamp,
    });

    yield* Effect.logInfo("clover.import.run.begin", {
      requestId,
      workflowStage: "import_begin",
      entityType,
      merchantId,
      startTimestamp,
      pageSize,
    });

    let offset = 0;
    let pages = 0;
    let listed = 0;
    let enqueued = 0;
    let newWatermark = startTimestamp;

    while (pages < MAX_PAGES) {
      const receivedAt = yield* now;
      const elements = yield* source.list({
        merchantId,
        startTimestamp,
        limit: pageSize,
        offset,
      });
      pages += 1;
      listed += elements.length;

      if (elements.length > 0) {
        const { inserted } = yield* source.enqueue(elements, {
          merchantId,
          requestId,
          receivedAt,
        });
        enqueued += inserted;

        for (const element of elements) {
          const timestamp = source.getTimestamp(element);
          if (timestamp > newWatermark) {
            newWatermark = timestamp;
          }
        }
      }

      // A short page means we have reached the end of the available records.
      if (elements.length < pageSize) {
        break;
      }
      offset += elements.length;
    }

    if (newWatermark > startTimestamp) {
      const runAt = yield* now;
      yield* CloverImportCursorRepository.advance({
        merchantId,
        entityType,
        lastTimestamp: newWatermark,
        runAt,
      });
    }

    yield* Effect.logInfo("clover.import.run.completed", {
      requestId,
      workflowStage: "import_completed",
      entityType,
      merchantId,
      startTimestamp,
      newWatermark,
      listed,
      enqueued,
      pages,
    });

    return {
      entityType,
      merchantId,
      startTimestamp,
      newWatermark,
      listed,
      enqueued,
      pages,
    };
  });
}
