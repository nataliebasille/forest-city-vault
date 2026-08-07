import { Effect, Schema } from "effect";
import { Clock } from "@forest-city-vault/core-clock";
import * as events from "./vendor.events";
import { BasisPointsSchema } from "../value-objects/basis-points";
import { VendorSchema } from "./vendor.entity";
import {
  VendorAlreadyActiveError,
  VendorAlreadyInactiveError,
  VendorCloverCategoryBlankError,
  VendorCommissionShareOutOfRangeError,
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

type VendorCreatedEvent = {
  type: "VendorCreated";
  payload: typeof events.VendorCreated.schema.Type;
};

type VendorRenamedEvent = {
  type: "VendorRenamed";
  payload: typeof events.VendorRenamed.schema.Type;
};

type VendorCloverCategoryLinkedEvent = {
  type: "VendorCloverCategoryLinked";
  payload: typeof events.VendorCloverCategoryLinked.schema.Type;
};

type VendorActivatedEvent = {
  type: "VendorActivated";
  payload: typeof events.VendorActivated.schema.Type;
};

type VendorDeactivatedEvent = {
  type: "VendorDeactivated";
  payload: typeof events.VendorDeactivated.schema.Type;
};

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
