import { CloverConfig } from "@forest-city-vault/core-config";
import { Vendor } from "@forest-city-vault/domain";
import { getCloverItem } from "@forest-city-vault/infrastructure-clover";
import {
  drain,
  RepositoriesSagaScoped,
  VendorQueries,
} from "@forest-city-vault/infrastructure-database";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";
import { Config, Duration, Effect, Option, Schema } from "effect";
import { runImport, vendorItemsImportSource } from "../import/public";

/**
 * The Clover vendor-items jobs, expressed as plain Effect programs independent of
 * any HTTP boundary. The `/api/import/vendor-items` and
 * `/api/process/vendor-items` routes wrap these with request auth/tracing, and a
 * scheduled runner can drive the same programs directly. Keeping the logic here
 * means a single implementation of the import loop and the Clover item -> vendor
 * reconciliation, regardless of what triggers it.
 */

// How many inbox messages a single drain pulls, and how long to wait between
// them. Each `upsert` message costs one Clover call (the item), so the drain is
// paced to stay under Clover's per-merchant rate limit. Both are overridable via
// env for tuning without a redeploy.
const DEFAULT_DRAIN_BATCH_SIZE = 30;
const DEFAULT_DRAIN_MESSAGE_DELAY_MS = 250;

/**
 * Incrementally pulls the configured merchant's inventory items from the Clover
 * API into the vendor-item inbox, resuming from the per-stream watermark.
 * Reconciling inbox rows onto their vendors is {@link processVendorItems}'s job.
 */
export function importVendorItems(options: { readonly requestId: string }) {
  return Effect.gen(function* () {
    const { merchantId } = yield* CloverConfig;

    // No `coldStartLookbackMs`: the items endpoint has no 90-day filter clamp, so
    // a cold cursor backfills the full catalog from the epoch (`modifiedTime>=0`).
    yield* runImport(vendorItemsImportSource, {
      merchantId,
      requestId: options.requestId,
    });
  });
}

/**
 * Drains the vendor-item inbox, reconciling each message onto its vendor. Each
 * message is processed as its own saga (its own transaction), so a single bad
 * item fails in isolation and is recorded without rolling back the rest of the
 * batch. Returns the number of messages processed this run.
 *
 * - An `upsert` message fetches the current Clover item, resolves the vendor
 *   through the item's category, and applies it (add/update, or a no-op when the
 *   vendor already matches).
 * - A `delete` message resolves the owning vendor by the persisted item id and
 *   removes the item.
 *
 * A message whose item maps to no known vendor category (or a delete for an item
 * no vendor holds) is a successful no-op: it is marked processed so it does not
 * retry forever, since the vendor may simply not be modelled here.
 */
export function processVendorItems(options: { readonly requestId: string }) {
  const { requestId } = options;

  return Effect.gen(function* () {
    yield* Effect.logInfo("clover.vendor_items.drain.begin", {
      requestId,
      workflowStage: "drain_inbox",
      inbox: "vendorItems",
    });

    const batchSize = yield* Config.integer("CLOVER_DRAIN_BATCH_SIZE").pipe(
      Config.withDefault(DEFAULT_DRAIN_BATCH_SIZE),
    );
    const messageDelayMs = yield* Config.integer(
      "CLOVER_DRAIN_MESSAGE_DELAY_MS",
    ).pipe(Config.withDefault(DEFAULT_DRAIN_MESSAGE_DELAY_MS));

    const processed = yield* drain({
      inbox: "vendorItems",
      requestId,
      batchSize,
      delayBetweenMessages: Duration.millis(messageDelayMs),
      action: (message) =>
        message.eventType === "delete" ?
          removeItem(message.providerObjectId)
        : upsertItem(message.providerObjectId, message.payloadJson),
    });

    yield* Effect.logInfo("clover.vendor_items.drain.completed", {
      requestId,
      workflowStage: "completed",
      inbox: "vendorItems",
      processedCount: processed.length,
    });

    return processed.length;
  }).pipe(Effect.provide(provideSagaScoped(RepositoriesSagaScoped)));
}

/**
 * One full vendor-items cycle: import new/changed Clover items into the inbox,
 * then drain the inbox onto vendors. This is the unit a scheduled trigger runs on
 * each tick.
 */
export function runVendorItemsCycle(options: { readonly requestId: string }) {
  return Effect.gen(function* () {
    yield* importVendorItems(options);
    yield* processVendorItems({ requestId: options.requestId });
  });
}

const VendorItemPayloadSchema = Schema.Struct({
  merchantId: Schema.String,
});

const decodeVendorItemPayload = Schema.decodeUnknown(
  Schema.parseJson(VendorItemPayloadSchema),
);

function upsertItem(itemId: string, payloadJson: string) {
  return Effect.gen(function* () {
    const { merchantId } = yield* decodeVendorItemPayload(payloadJson);

    const item = yield* getCloverItem(merchantId, itemId);

    // Find the vendor the item belongs to: a Clover category is a vendor, and an
    // item can be filed under several categories, so try each and take the first
    // that maps to a modelled vendor.
    const categoryIds =
      item.categories?.elements?.map((category) => category.id) ?? [];

    const vendor = yield* resolveVendorByCategories(categoryIds);
    if (Option.isNone(vendor)) {
      // The item is not filed under any vendor category we model; nothing to do.
      return;
    }

    const applied = yield* Vendor.actions.applyCloverItem(vendor.value, {
      item: {
        cloverItemId: item.id,
        name: item.name ?? "",
        price: item.price ?? 0,
      },
    });

    // No event means the vendor already matched the item; skip the write.
    if (applied.version === vendor.value.version) {
      return;
    }

    yield* Vendor.repository.save(applied);
  });
}

function resolveVendorByCategories(categoryIds: readonly string[]) {
  return Effect.gen(function* () {
    for (const categoryId of categoryIds) {
      const found = yield* VendorQueries.getByCloverCategoryId(categoryId);
      if (Option.isSome(found)) {
        return found;
      }
    }
    return Option.none();
  });
}

function removeItem(itemId: string) {
  return Effect.gen(function* () {
    const vendor = yield* VendorQueries.getByCloverItemId(itemId);
    if (Option.isNone(vendor)) {
      // No vendor holds this item (never synced, or already removed); no-op.
      return;
    }

    const removed = yield* Vendor.actions.removeCloverItem(vendor.value, {
      cloverItemId: itemId,
    });

    if (removed.version === vendor.value.version) {
      return;
    }

    yield* Vendor.repository.save(removed);
  });
}
