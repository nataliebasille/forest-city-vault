import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { staticClock } from "@forest-city-vault/core-clock";
import { CloverImportCursorRepository } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect, Exit, Layer, Option } from "effect";

import type { ImportSource } from "./import-source";
import { runImport } from "./run-import";

const NOW = new Date("2024-06-01T00:00:00.000Z");
const MERCHANT = "m-1";

// Cold-start backfill window used by the tests. The first run starts from
// `NOW - LOOKBACK_MS` instead of 0.
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const COLD_FLOOR = NOW.getTime() - LOOKBACK_MS;

// The single-page size the fake source owns (the engine no longer chooses it).
const PAGE_LIMIT = 10;

type FakeRecord = { id: string; createdTime: number };

type ListCall = { startTimestamp: number };

/**
 * A fake import source backed by an in-memory dataset. It records every `list`
 * call (so a test can assert the watermark passed on each run) and returns a
 * single ascending `createdTime>=start` page whose size the source owns, so the
 * engine's single-page/cursor behavior is exercised without any HTTP.
 */
function makeFakeSource(dataset: readonly FakeRecord[]) {
  const listCalls: ListCall[] = [];
  const enqueued: FakeRecord[] = [];

  const source: ImportSource<FakeRecord, never> = {
    entityType: "order",
    watermarkAxis: "createdTime",
    list: ({ startTimestamp }) => {
      listCalls.push({ startTimestamp });
      const page = dataset
        .filter((r) => r.createdTime >= startTimestamp)
        .sort((a, b) => a.createdTime - b.createdTime)
        .slice(0, PAGE_LIMIT);
      return Effect.succeed(page);
    },
    getTimestamp: (r) => r.createdTime,
    enqueue: (elements) => {
      enqueued.push(...elements);
      return Effect.succeed({ inserted: elements.length });
    },
  };

  return { source, listCalls, enqueued };
}

describe("runImport", () => {
  test("first run backfills from the cold-start floor, fetches a single page, and advances the cursor", async () => {
    const { run } = await makeContext();
    // One record before the floor (must be excluded) plus 31 at/after it — more
    // than a single page, so only the first page is imported this run.
    const dataset = [
      { id: "before-floor", createdTime: COLD_FLOOR - 1000 },
      ...Array.from({ length: 31 }, (_, i) => ({
        id: `o-${i}`,
        createdTime: COLD_FLOOR + i,
      })),
    ];
    const { source, listCalls, enqueued } = makeFakeSource(dataset);

    const exit = await run(
      runImport(source, {
        merchantId: MERCHANT,
        requestId: "req-1",
        coldStartLookbackMs: LOOKBACK_MS,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      // Cold cursor starts from `NOW - lookback`, never 0.
      assert.equal(exit.value.startTimestamp, COLD_FLOOR);
      // Only the first page (PAGE_LIMIT records) is listed this run.
      assert.equal(exit.value.listed, PAGE_LIMIT);
      assert.equal(exit.value.enqueued, PAGE_LIMIT);
      assert.equal(exit.value.newWatermark, COLD_FLOOR + PAGE_LIMIT - 1);
    }

    // Exactly one list call, starting at the floor.
    assert.equal(listCalls.length, 1);
    assert.equal(listCalls[0].startTimestamp, COLD_FLOOR);
    // The record before the floor is filtered out, never enqueued.
    assert.equal(enqueued.length, PAGE_LIMIT);
    assert.equal(
      enqueued.some((r) => r.id === "before-floor"),
      false,
    );

    // The cursor was advanced to the newest createdTime in the page.
    const cursor = await run(
      CloverImportCursorRepository.get(MERCHANT, "order"),
    );
    if (Exit.isSuccess(cursor) && Option.isSome(cursor.value)) {
      assert.equal(cursor.value.value.lastTimestamp, COLD_FLOOR + PAGE_LIMIT - 1);
    } else {
      assert.fail("expected cursor to be advanced");
    }
  });

  test("second run resumes from the watermark instead of rescanning from 0", async () => {
    const { run } = await makeContext();

    // Seed a cursor as if a prior run imported up to createdTime 1030.
    await run(
      CloverImportCursorRepository.advance({
        merchantId: MERCHANT,
        entityType: "order",
        lastTimestamp: 1030,
        runAt: NOW,
      }),
    );

    // Dataset now has two newer orders (1040, 1050) plus the old ones. The
    // boundary (1030) plus both new records fit in a single page.
    const dataset = [
      ...makeDataset(31),
      { id: "o-1040", createdTime: 1040 },
      {
        id: "o-1050",
        createdTime: 1050,
      },
    ];
    const { source, listCalls, enqueued } = makeFakeSource(dataset);

    const exit = await run(
      runImport(source, {
        merchantId: MERCHANT,
        requestId: "req-2",
        coldStartLookbackMs: LOOKBACK_MS,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      // It resumed from the stored watermark, not 0.
      assert.equal(exit.value.startTimestamp, 1030);
      assert.equal(exit.value.newWatermark, 1050);
    }

    // A single list call, using the watermark (1030) as the inclusive lower
    // bound — it never went back to the start of time.
    assert.equal(listCalls.length, 1);
    assert.equal(listCalls[0].startTimestamp, 1030);

    // The inclusive boundary re-includes createdTime 1030, plus the two new ones.
    const enqueuedIds = enqueued.map((r) => r.id).sort();
    assert.deepEqual(enqueuedIds, ["o-1030", "o-1040", "o-1050"]);
  });

  test("does not advance the cursor when there is nothing new", async () => {
    const { run } = await makeContext();

    await run(
      CloverImportCursorRepository.advance({
        merchantId: MERCHANT,
        entityType: "order",
        lastTimestamp: 1030,
        runAt: NOW,
      }),
    );

    // Only records at/below the watermark exist.
    const { source, enqueued } = makeFakeSource(makeDataset(31));

    const exit = await run(
      runImport(source, {
        merchantId: MERCHANT,
        requestId: "req-3",
        coldStartLookbackMs: LOOKBACK_MS,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.startTimestamp, 1030);
      assert.equal(exit.value.newWatermark, 1030);
    }
    // Only the boundary record (1030) is re-listed and enqueued (idempotently).
    assert.deepEqual(
      enqueued.map((r) => r.id),
      ["o-1030"],
    );
  });
});

function makeDataset(count: number): FakeRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `o-${1000 + i}`,
    createdTime: 1000 + i,
  }));
}

async function makeContext() {
  const { layer: databaseLayer } = await makeDatabaseTestContext();
  const layer = Layer.mergeAll(databaseLayer, staticClock(NOW));

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromiseExit(
      effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E, never>,
    );

  return { run };
}
