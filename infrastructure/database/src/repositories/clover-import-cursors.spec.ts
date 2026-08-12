import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { Effect, Exit, Layer, Option } from "effect";

import { CloverImportCursorRepository } from "./clover-import-cursors";
import { makeDatabaseTestContext } from "../testing";

const NOW = new Date("2024-06-01T00:00:00.000Z");

describe("CloverImportCursorRepository", () => {
  test("returns None for a stream that has never run", async () => {
    const { run } = await makeContext();

    const result = await run(
      CloverImportCursorRepository.get("m-1", "order"),
    );

    assert.equal(Exit.isSuccess(result), true);
    if (Exit.isSuccess(result)) {
      assert.equal(Option.isNone(result.value), true);
    }
  });

  test("advance inserts then reads back the watermark", async () => {
    const { run } = await makeContext();

    await run(
      CloverImportCursorRepository.advance({
        merchantId: "m-1",
        entityType: "order",
        lastTimestamp: 1000,
        runAt: NOW,
      }),
    );

    const result = await run(
      CloverImportCursorRepository.get("m-1", "order"),
    );

    assert.equal(Exit.isSuccess(result), true);
    if (Exit.isSuccess(result) && Option.isSome(result.value)) {
      assert.equal(result.value.value.lastTimestamp, 1000);
    } else {
      assert.fail("expected a cursor row");
    }
  });

  test("advance only moves the watermark forward (greatest wins)", async () => {
    const { run } = await makeContext();

    const advance = (lastTimestamp: number) =>
      CloverImportCursorRepository.advance({
        merchantId: "m-1",
        entityType: "order",
        lastTimestamp,
        runAt: NOW,
      });

    await run(advance(5000));
    // A stale/out-of-order run reports an older watermark: it must not rewind.
    await run(advance(2000));

    const result = await run(
      CloverImportCursorRepository.get("m-1", "order"),
    );

    if (Exit.isSuccess(result) && Option.isSome(result.value)) {
      assert.equal(result.value.value.lastTimestamp, 5000);
    } else {
      assert.fail("expected a cursor row");
    }
  });

  test("keeps separate watermarks per (merchant, entity)", async () => {
    const { run } = await makeContext();

    await run(
      CloverImportCursorRepository.advance({
        merchantId: "m-1",
        entityType: "order",
        lastTimestamp: 100,
        runAt: NOW,
      }),
    );
    await run(
      CloverImportCursorRepository.advance({
        merchantId: "m-1",
        entityType: "vendor_item",
        lastTimestamp: 900,
        runAt: NOW,
      }),
    );

    const orders = await run(
      CloverImportCursorRepository.get("m-1", "order"),
    );
    const items = await run(
      CloverImportCursorRepository.get("m-1", "vendor_item"),
    );

    if (
      Exit.isSuccess(orders) &&
      Option.isSome(orders.value) &&
      Exit.isSuccess(items) &&
      Option.isSome(items.value)
    ) {
      assert.equal(orders.value.value.lastTimestamp, 100);
      assert.equal(items.value.value.lastTimestamp, 900);
    } else {
      assert.fail("expected both cursor rows");
    }
  });
});

async function makeContext() {
  const { layer: databaseLayer } = await makeDatabaseTestContext();
  const layer = Layer.mergeAll(databaseLayer);

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromiseExit(
      effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E, never>,
    );

  return { run };
}
