import { CloverConfig } from "@forest-city-vault/core-config";
import type {
  AggregateType_GetId,
  AggregateType_GetSnapshot,
  MaterializedAggregateRoot,
} from "@forest-city-vault/core-domain";
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

type VendorAggregate = MaterializedAggregateRoot<
  AggregateType_GetId<typeof Vendor>,
  AggregateType_GetSnapshot<typeof Vendor>
>;

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
 * - An `upsert` message fetches the current Clover item and reconciles it onto a
 *   vendor: when a category maps to an existing vendor the vendor's name is kept
 *   in sync with the category (Clover is the source of truth), when a category
 *   maps to no vendor one is created for it, and when the item has no category at
 *   all it is attached to a shared "Custom item" vendor so nothing is dropped.
 * - A `delete` message resolves the owning vendor by the persisted item id and
 *   removes the item.
 *
 * A `delete` for an item no vendor holds is a successful no-op: it is marked
 * processed so it does not retry forever, since the vendor may simply not be
 * modelled here.
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

// A fixed, stable identity for the single shared vendor that holds items which
// arrive with no Clover category to derive a vendor from. Like the bootstrap
// store id, a hard-coded id is what makes the fallback idempotent: every
// uncategorized item resolves to the same vendor instead of minting a new one.
const CUSTOM_ITEM_VENDOR_ID = "01920000-0000-7000-8000-0000000000c1";
const CUSTOM_ITEM_VENDOR_NAME = "Custom item";

function upsertItem(itemId: string, payloadJson: string) {
  return Effect.gen(function* () {
    const { merchantId } = yield* decodeVendorItemPayload(payloadJson);

    const item = yield* getCloverItem(merchantId, itemId);

    // A Clover category is a vendor, and an item can be filed under several
    // categories. Resolve the vendor from those categories — reusing an existing
    // one, creating one for an unmodelled category, or falling back to the shared
    // "Custom item" vendor when the item has no category at all — then apply the
    // item to it.
    const categories = item.categories?.elements ?? [];
    const categoryIds = categories.map((category) => category.id);

    const resolved = yield* resolveVendorByCategories(categoryIds);

    let vendor: VendorAggregate;
    // The vendor's version before we apply anything this run. We persist only
    // when the final aggregate has moved past it — the same "changed since we
    // loaded it" test the EventTracker uses — which captures a rename, a create,
    // and an item change alike without needing a separate flag.
    let baseVersion: number;

    if (Option.isSome(resolved)) {
      const { vendor: existing, matchedCategoryId } = resolved.value;
      baseVersion = existing.version;

      // Keep the vendor's name in sync with its Clover category — Clover is the
      // source of truth. The action itself no-ops when the category name is
      // blank or unchanged, so no guarding is needed here.
      const matchedName =
        categories.find((category) => category.id === matchedCategoryId)?.name ??
        "";

      vendor = yield* Vendor.actions.syncCloverCategoryName(existing, {
        name: matchedName,
      });
    } else if (categories.length > 0) {
      // None of the item's categories maps to a modelled vendor. Create one for
      // the first category — in Clover each category is a vendor — named after
      // the category (falling back to its id when Clover gives no name).
      const primary = categories[0];
      const primaryName = primary.name?.trim();
      const pristine = Vendor.pristine(crypto.randomUUID());
      baseVersion = pristine.version;

      vendor = yield* Vendor.actions.create(pristine, {
        name:
          primaryName !== undefined && primaryName.length > 0 ?
            primaryName
          : primary.id,
        cloverCategoryId: primary.id,
      });
    } else {
      // The item is filed under no category at all; attach it to the shared
      // "Custom item" vendor so it is never dropped and can be re-filed later.
      const custom = yield* resolveCustomItemVendor;
      vendor = custom.vendor;
      baseVersion = custom.baseVersion;
    }

    const applied = yield* Vendor.actions.applyCloverItem(vendor, {
      item: {
        cloverItemId: item.id,
        name: item.name ?? "",
        price: item.price ?? 0,
      },
    });

    // Nothing changed since we loaded the vendor (no rename, no create, and the
    // item already matched); skip the redundant write.
    if (applied.version === baseVersion) {
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
        return Option.some({
          vendor: found.value,
          matchedCategoryId: categoryId,
        });
      }
    }
    return Option.none<{
      vendor: VendorAggregate;
      matchedCategoryId: string;
    }>();
  });
}

// Loads the shared "Custom item" vendor by its fixed id, creating it on first
// use. `baseVersion` is the vendor's version before this run so the caller can
// tell whether the create (or a later item apply) actually moved it.
const resolveCustomItemVendor = Effect.gen(function* () {
  const pristine = Vendor.pristine(CUSTOM_ITEM_VENDOR_ID);

  const existing = yield* Vendor.repository.getById(pristine.id).pipe(
    Effect.asSome,
    Effect.catchTag(
      "core/domain/Repository/AggregateNotFoundError",
      () => Effect.succeedNone,
    ),
  );

  if (Option.isSome(existing)) {
    return { vendor: existing.value, baseVersion: existing.value.version };
  }

  const created = yield* Vendor.actions.create(pristine, {
    name: CUSTOM_ITEM_VENDOR_NAME,
  });

  return { vendor: created, baseVersion: pristine.version };
});

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
