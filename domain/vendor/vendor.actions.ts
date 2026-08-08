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

const normalizeIncomingItems = (
  items: typeof SyncCloverItemsSchema.Type.items,
) =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    const normalized: VendorItem[] = [];

    for (const raw of items) {
      const cloverItemId = raw.cloverItemId.trim();
      if (cloverItemId.length === 0) {
        return yield* Effect.fail(new VendorItemCloverIdBlankError());
      }
      if (seen.has(cloverItemId)) {
        return yield* Effect.fail(new VendorItemDuplicateError({ cloverItemId }));
      }
      seen.add(cloverItemId);

      const price = yield* decodeCents(raw.price).pipe(
        Effect.mapError(() => new VendorItemPriceInvalidError({ cloverItemId })),
      );

      normalized.push({ cloverItemId, name: raw.name.trim(), price });
    }

    return normalized;
  });
