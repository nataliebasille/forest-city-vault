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
  /**
   * Watermark the run started from (epoch ms). On a cold cursor this is the
   * backfill floor: `now - coldStartLookbackMs` when a lookback is given, or `0`
   * (backfill from the epoch) when it is omitted.
   */
  readonly startTimestamp: number;
  /** Watermark the cursor was advanced to (epoch ms). */
  readonly newWatermark: number;
  /** Total elements listed from Clover this run (the single page). */
  readonly listed: number;
  /** Rows newly inserted into the inbox (excludes idempotent duplicates). */
  readonly enqueued: number;
};

/**
 * Runs one incremental import for a single entity stream.
 *
 * Reads the stream's watermark, asks Clover for a single ascending page of
 * records at/after it (inclusive), enqueues that page into the entity's inbox,
 * and advances the watermark to the newest timestamp seen. The source owns how
 * many records the page holds, so a backlog is worked off across successive runs
 * rather than in one long paging loop. The inclusive `>=` boundary re-includes
 * the last record(s) so nothing is skipped when timestamps tie; the source's
 * idempotent enqueue absorbs that overlap.
 *
 * On a cold cursor (no stored watermark) the run starts from a backfill floor.
 * A source that passes `coldStartLookbackMs` floors at `now - coldStartLookbackMs`
 * rather than `0`; a source that omits it backfills from the epoch (`0`).
 *
 * The cursor is advanced only after the page was enqueued, so a mid-run
 * failure leaves the watermark untouched and the next run safely reprocesses
 * from the same point (again idempotently).
 */
export function runImport<Element, R>(
  source: ImportSource<Element, R>,
  options: {
    readonly merchantId: string;
    readonly requestId: string;
    /**
     * How far back (in ms) a cold run reaches. When set, the first run starts
     * from `now - coldStartLookbackMs`; when omitted it backfills from the epoch
     * (`0`). Steady-state runs resume from the stored watermark and ignore this.
     */
    readonly coldStartLookbackMs?: number;
  },
): Effect.Effect<ImportSummary, unknown, R | Database | Clock> {
  return Effect.gen(function* () {
    const { merchantId, requestId } = options;
    const { entityType } = source;

    const cursor = yield* CloverImportCursorRepository.get(
      merchantId,
      entityType,
    );
    const runStart = yield* now;
    const coldStartFloor =
      options.coldStartLookbackMs === undefined ?
        0
      : runStart.getTime() - options.coldStartLookbackMs;
    const startTimestamp = Option.match(cursor, {
      onNone: () => coldStartFloor,
      onSome: (row) => row.lastTimestamp,
    });

    yield* Effect.logInfo("clover.import.run.begin", {
      requestId,
      workflowStage: "import_begin",
      entityType,
      merchantId,
      startTimestamp,
    });

    let newWatermark = startTimestamp;

    const receivedAt = yield* now;
    const elements = yield* source.list({ merchantId, startTimestamp });
    const listed = elements.length;
    let enqueued = 0;

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
    });

    return {
      entityType,
      merchantId,
      startTimestamp,
      newWatermark,
      listed,
      enqueued,
    };
  });
}
