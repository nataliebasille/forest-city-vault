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

type FakeRecord = { id: string; createdTime: number };

type ListCall = { startTimestamp: number; limit: number; offset: number };

/**
 * A fake import source backed by an in-memory dataset. It records every `list`
 * call (so a test can assert the watermark passed on each run) and applies the
 * same ascending `createdTime>=start` paging the real Clover list performs, so
 * the engine's paging/cursor behavior is exercised without any HTTP.
 */
function makeFakeSource(dataset: readonly FakeRecord[]) {
  const listCalls: ListCall[] = [];
  const enqueued: FakeRecord[] = [];

  const source: ImportSource<FakeRecord, never> = {
    entityType: "payment",
    watermarkAxis: "createdTime",
    list: ({ startTimestamp, limit, offset }) => {
      listCalls.push({ startTimestamp, limit, offset });
      const page = dataset
        .filter((r) => r.createdTime >= startTimestamp)
        .sort((a, b) => a.createdTime - b.createdTime)
        .slice(offset, offset + limit);
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
  test("first run backfills from 0, pages to the end, and advances the cursor", async () => {
    const { run } = await makeContext();
    const dataset = makeDataset(31); // timestamps 1000..1030
    const { source, listCalls, enqueued } = makeFakeSource(dataset);

    const exit = await run(
      runImport(source, {
        merchantId: MERCHANT,
        requestId: "req-1",
        pageSize: 10,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.startTimestamp, 0);
      assert.equal(exit.value.listed, 31);
      assert.equal(exit.value.enqueued, 31);
      assert.equal(exit.value.newWatermark, 1030);
    }

    // First list call starts at 0 (full backfill); paging walked 4 pages
    // (10 + 10 + 10 + 1) with growing offsets.
    assert.equal(listCalls[0].startTimestamp, 0);
    assert.deepEqual(
      listCalls.map((c) => c.offset),
      [0, 10, 20, 30],
    );
    assert.equal(enqueued.length, 31);

    // The cursor was advanced to the newest createdTime.
    const cursor = await run(
      CloverImportCursorRepository.get(MERCHANT, "payment"),
    );
    if (Exit.isSuccess(cursor) && Option.isSome(cursor.value)) {
      assert.equal(cursor.value.value.lastTimestamp, 1030);
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
        entityType: "payment",
        lastTimestamp: 1030,
        runAt: NOW,
      }),
    );

    // Dataset now has two newer payments (1040, 1050) plus the old ones.
    const dataset = [
      ...makeDataset(31),
      { id: "p-1040", createdTime: 1040 },
      {
        id: "p-1050",
        createdTime: 1050,
      },
    ];
    const { source, listCalls, enqueued } = makeFakeSource(dataset);

    const exit = await run(
      runImport(source, {
        merchantId: MERCHANT,
        requestId: "req-2",
        pageSize: 10,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      // It resumed from the stored watermark, not 0.
      assert.equal(exit.value.startTimestamp, 1030);
      assert.equal(exit.value.newWatermark, 1050);
    }

    // Every list call used the watermark (1030) as the inclusive lower bound —
    // it never went back to the start of time.
    for (const call of listCalls) {
      assert.equal(call.startTimestamp, 1030);
    }

    // The inclusive boundary re-includes createdTime 1030, plus the two new ones.
    const enqueuedIds = enqueued.map((r) => r.id).sort();
    assert.deepEqual(enqueuedIds, ["p-1030", "p-1040", "p-1050"]);
  });

  test("does not advance the cursor when there is nothing new", async () => {
    const { run } = await makeContext();

    await run(
      CloverImportCursorRepository.advance({
        merchantId: MERCHANT,
        entityType: "payment",
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
        pageSize: 10,
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
      ["p-1030"],
    );
  });

  test("floors a cold cursor to the lookback window when maxLookbackMs is set", async () => {
    const { run } = await makeContext();

    const nowMs = NOW.getTime();
    const lookbackMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const floor = nowMs - lookbackMs;

    // One payment older than the window (must be skipped) and two inside it.
    const dataset: FakeRecord[] = [
      { id: "old", createdTime: floor - 1000 },
      { id: "in-1", createdTime: floor + 1000 },
      { id: "in-2", createdTime: nowMs - 1000 },
    ];
    const { source, listCalls, enqueued } = makeFakeSource(dataset);

    const exit = await run(
      runImport(source, {
        merchantId: MERCHANT,
        requestId: "req-lookback",
        pageSize: 10,
        maxLookbackMs: lookbackMs,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      // The run started from the floor, not 0.
      assert.equal(exit.value.startTimestamp, floor);
      assert.equal(exit.value.newWatermark, nowMs - 1000);
    }

    // Every page used the floor as the inclusive lower bound.
    assert.equal(listCalls[0].startTimestamp, floor);
    // The out-of-window record was never enqueued.
    assert.deepEqual(
      enqueued.map((r) => r.id).sort(),
      ["in-1", "in-2"],
    );
  });

  test("does not move a cursor that is already inside the lookback window", async () => {
    const { run } = await makeContext();

    const nowMs = NOW.getTime();
    const lookbackMs = 30 * 24 * 60 * 60 * 1000;
    const recentWatermark = nowMs - 5000; // well inside the window

    await run(
      CloverImportCursorRepository.advance({
        merchantId: MERCHANT,
        entityType: "payment",
        lastTimestamp: recentWatermark,
        runAt: NOW,
      }),
    );

    const dataset: FakeRecord[] = [
      { id: "at-watermark", createdTime: recentWatermark },
      { id: "newer", createdTime: nowMs - 1000 },
    ];
    const { source, listCalls } = makeFakeSource(dataset);

    const exit = await run(
      runImport(source, {
        merchantId: MERCHANT,
        requestId: "req-recent",
        pageSize: 10,
        maxLookbackMs: lookbackMs,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      // The recent watermark was used unchanged (not lifted to the floor).
      assert.equal(exit.value.startTimestamp, recentWatermark);
    }
    for (const call of listCalls) {
      assert.equal(call.startTimestamp, recentWatermark);
    }
  });
});

function makeDataset(count: number): FakeRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${1000 + i}`,
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
