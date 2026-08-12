import { Effect, Schema } from "effect";
import { Clock } from "@forest-city-vault/core-clock";
import type {
  VendorActivatedEvent,
  VendorCloverCategoryLinkedEvent,
  VendorCreatedEvent,
  VendorDeactivatedEvent,
  VendorItemAddedEvent,
  VendorItemRemovedEvent,
  VendorItemUpdatedEvent,
  VendorRenamedEvent,
} from "./vendor.events";
import { BasisPointsSchema } from "../value-objects/basis-points";
import { CentsSchema } from "../value-objects/cents";
import { VendorItem, VendorSchema } from "./vendor.entity";
import {
  VendorAlreadyActiveError,
  VendorAlreadyInactiveError,
  VendorCloverCategoryBlankError,
  VendorCommissionShareOutOfRangeError,
  VendorItemCloverIdBlankError,
  VendorItemDuplicateError,
  VendorItemPriceInvalidError,
  VendorNameBlankError,
} from "./vendor.errors";

/** The vendor share applied at creation when the caller does not specify one. */
const DEFAULT_COMMISSION_SHARE = 6000;

export const CreateVendorSchema = Schema.Struct({
  name: Schema.String,
  commissionShare: Schema.optional(Schema.Number),
  cloverCategoryId: Schema.optional(Schema.String),
});

export const RenameVendorSchema = Schema.Struct({
  name: Schema.String,
});

export const SyncCloverCategoryNameSchema = Schema.Struct({
  name: Schema.String,
});

export const LinkCloverCategorySchema = Schema.Struct({
  cloverCategoryId: Schema.String,
});

export const SyncCloverItemsSchema = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      cloverItemId: Schema.String,
      name: Schema.String,
      price: Schema.Number,
    }),
  ),
});

/** A single Clover item to upsert onto the vendor (from a per-item sync). */
export const ApplyCloverItemSchema = Schema.Struct({
  item: Schema.Struct({
    cloverItemId: Schema.String,
    name: Schema.String,
    price: Schema.Number,
  }),
});

/** Identifies a single Clover item to drop from the vendor. */
export const RemoveCloverItemSchema = Schema.Struct({
  cloverItemId: Schema.String,
});

type VendorSnapshot = typeof VendorSchema.Type;

export const createVendor = (payload: typeof CreateVendorSchema.Type) =>
  Effect.gen(function* () {
    const name = yield* requireName(payload.name);
    const commissionShare = yield* requireCommissionShare(
      payload.commissionShare ?? DEFAULT_COMMISSION_SHARE,
    );
    const cloverCategoryId =
      payload.cloverCategoryId === undefined ?
        null
      : yield* requireCloverCategoryId(payload.cloverCategoryId);
    const createdAt = yield* now;

    return {
      type: "VendorCreated",
      payload: { name, commissionShare, cloverCategoryId, createdAt },
    } satisfies VendorCreatedEvent;
  });

export const renameVendor = (
  _snapshot: VendorSnapshot,
  payload: typeof RenameVendorSchema.Type,
) =>
  Effect.gen(function* () {
    const name = yield* requireName(payload.name);
    const updatedAt = yield* now;

    return {
      type: "VendorRenamed",
      payload: { name, updatedAt },
    } satisfies VendorRenamedEvent;
  });

/**
 * Renames the vendor to match its Clover category's name. Emits `VendorRenamed`
 * when the incoming name is non-blank and differs from the current one, and no
 * event otherwise — the lenient, sync-from-Clover counterpart to the strict
 * {@link renameVendor} command (which rejects a blank name). Used by the
 * vendor-items drain, where Clover is the source of truth for vendor names.
 */
export const syncCloverCategoryName = (
  snapshot: VendorSnapshot,
  payload: typeof SyncCloverCategoryNameSchema.Type,
) =>
  Effect.gen(function* () {
    const name = payload.name.trim();

    if (name.length === 0 || name === snapshot.name) {
      return [] as VendorRenamedEvent[];
    }

    const updatedAt = yield* now;

    return [
      {
        type: "VendorRenamed",
        payload: { name, updatedAt },
      },
    ] satisfies VendorRenamedEvent[];
  });

export const linkCloverCategory = (
  _snapshot: VendorSnapshot,
  payload: typeof LinkCloverCategorySchema.Type,
) =>
  Effect.gen(function* () {
    const cloverCategoryId = yield* requireCloverCategoryId(
      payload.cloverCategoryId,
    );
    const updatedAt = yield* now;

    return {
      type: "VendorCloverCategoryLinked",
      payload: { cloverCategoryId, updatedAt },
    } satisfies VendorCloverCategoryLinkedEvent;
  });

export const activateVendor = (snapshot: VendorSnapshot) =>
  Effect.gen(function* () {
    if (snapshot.status === "active") {
      return yield* Effect.fail(new VendorAlreadyActiveError());
    }

    const updatedAt = yield* now;

    return {
      type: "VendorActivated",
      payload: { updatedAt },
    } satisfies VendorActivatedEvent;
  });

export const deactivateVendor = (snapshot: VendorSnapshot) =>
  Effect.gen(function* () {
    if (snapshot.status === "inactive") {
      return yield* Effect.fail(new VendorAlreadyInactiveError());
    }

    const updatedAt = yield* now;

    return {
      type: "VendorDeactivated",
      payload: { updatedAt },
    } satisfies VendorDeactivatedEvent;
  });

export const syncCloverItems = (
  snapshot: VendorSnapshot,
  payload: typeof SyncCloverItemsSchema.Type,
) =>
  Effect.gen(function* () {
    const incoming = yield* normalizeIncomingItems(payload.items);
    const updatedAt = yield* now;

    const existingById = new Map(
      snapshot.items.map((item) => [item.cloverItemId, item]),
    );
    const incomingIds = new Set(incoming.map((item) => item.cloverItemId));

    const events: Array<
      VendorItemAddedEvent | VendorItemUpdatedEvent | VendorItemRemovedEvent
    > = [];

    for (const item of incoming) {
      const existing = existingById.get(item.cloverItemId);

      if (existing === undefined) {
        events.push({ type: "VendorItemAdded", payload: { item, updatedAt } });
      } else if (existing.name !== item.name || existing.price !== item.price) {
        events.push({ type: "VendorItemUpdated", payload: { item, updatedAt } });
      }
    }

    for (const item of snapshot.items) {
      if (!incomingIds.has(item.cloverItemId)) {
        events.push({
          type: "VendorItemRemoved",
          payload: { cloverItemId: item.cloverItemId, updatedAt },
        });
      }
    }

    return events;
  });

/**
 * Upserts a single Clover item onto the vendor. Emits `VendorItemAdded` when the
 * item is new, `VendorItemUpdated` when its name or price changed, and no event
 * when it already matches — the per-item counterpart of {@link syncCloverItems},
 * used when items stream in one at a time (e.g. from a Clover webhook/inbox).
 */
export const applyCloverItem = (
  snapshot: VendorSnapshot,
  payload: typeof ApplyCloverItemSchema.Type,
) =>
  Effect.gen(function* () {
    const item = yield* normalizeItem(payload.item);
    const updatedAt = yield* now;

    const existing = snapshot.items.find(
      (candidate) => candidate.cloverItemId === item.cloverItemId,
    );

    const events: Array<VendorItemAddedEvent | VendorItemUpdatedEvent> = [];

    if (existing === undefined) {
      events.push({ type: "VendorItemAdded", payload: { item, updatedAt } });
    } else if (existing.name !== item.name || existing.price !== item.price) {
      events.push({ type: "VendorItemUpdated", payload: { item, updatedAt } });
    }

    return events;
  });

/**
 * Drops a single Clover item from the vendor. Emits `VendorItemRemoved` when the
 * item is present and no event otherwise, so a delete for an item the vendor
 * never held (or already dropped) is a safe no-op.
 */
export const removeCloverItem = (
  snapshot: VendorSnapshot,
  payload: typeof RemoveCloverItemSchema.Type,
) =>
  Effect.gen(function* () {
    const cloverItemId = payload.cloverItemId.trim();
    if (cloverItemId.length === 0) {
      return yield* Effect.fail(new VendorItemCloverIdBlankError());
    }

    const present = snapshot.items.some(
      (candidate) => candidate.cloverItemId === cloverItemId,
    );
    if (!present) {
      return [] as VendorItemRemovedEvent[];
    }

    const updatedAt = yield* now;

    return [
      {
        type: "VendorItemRemoved",
        payload: { cloverItemId, updatedAt },
      },
    ] satisfies VendorItemRemovedEvent[];
  });

const now = Effect.flatMap(Clock, (clock) => clock.now);

const requireName = (raw: string) => {
  const name = raw.trim();

  return name.length === 0 ?
      Effect.fail(new VendorNameBlankError())
    : Effect.succeed(name);
};

const requireCloverCategoryId = (raw: string) => {
  const cloverCategoryId = raw.trim();

  return cloverCategoryId.length === 0 ?
      Effect.fail(new VendorCloverCategoryBlankError())
    : Effect.succeed(cloverCategoryId);
};

const decodeBasisPoints = Schema.decodeUnknown(BasisPointsSchema);

const requireCommissionShare = (raw: number) =>
  decodeBasisPoints(raw).pipe(
    Effect.mapError(
      () => new VendorCommissionShareOutOfRangeError({ commissionShare: raw }),
    ),
  );

const decodeCents = Schema.decodeUnknown(CentsSchema);

const normalizeItem = (raw: {
  readonly cloverItemId: string;
  readonly name: string;
  readonly price: number;
}) =>
  Effect.gen(function* () {
    const cloverItemId = raw.cloverItemId.trim();
    if (cloverItemId.length === 0) {
      return yield* Effect.fail(new VendorItemCloverIdBlankError());
    }

    const price = yield* decodeCents(raw.price).pipe(
      Effect.mapError(() => new VendorItemPriceInvalidError({ cloverItemId })),
    );

    return { cloverItemId, name: raw.name.trim(), price } satisfies VendorItem;
  });

const normalizeIncomingItems = (
  items: typeof SyncCloverItemsSchema.Type.items,
) =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    const normalized: VendorItem[] = [];

    for (const raw of items) {
      const item = yield* normalizeItem(raw);
      if (seen.has(item.cloverItemId)) {
        return yield* Effect.fail(
          new VendorItemDuplicateError({ cloverItemId: item.cloverItemId }),
        );
      }
      seen.add(item.cloverItemId);
      normalized.push(item);
    }

    return normalized;
  });
