import { Effect, Schema } from "effect";
import { Clock } from "@forest-city-vault/core-clock";
import * as events from "./store-account.events";
import {
  StoreAlreadyActiveError,
  StoreAlreadyInactiveError,
  StoreNameBlankError,
  StoreTimeZoneBlankError,
} from "./store-account.errors";
import { StoreAccountSchema } from "./store-account.entity";

export const CreateStoreSchema = Schema.Struct({
  name: Schema.String,
  timeZone: Schema.String,
});

export const RenameStoreSchema = Schema.Struct({
  name: Schema.String,
});

export const ChangeStoreTimeZoneSchema = Schema.Struct({
  timeZone: Schema.String,
});

type StoreCreatedEvent = {
  type: "StoreCreated";
  payload: typeof events.StoreCreated.schema.Type;
};

type StoreRenamedEvent = {
  type: "StoreRenamed";
  payload: typeof events.StoreRenamed.schema.Type;
};

type StoreTimeZoneChangedEvent = {
  type: "StoreTimeZoneChanged";
  payload: typeof events.StoreTimeZoneChanged.schema.Type;
};

type StoreActivatedEvent = {
  type: "StoreActivated";
  payload: typeof events.StoreActivated.schema.Type;
};

type StoreDeactivatedEvent = {
  type: "StoreDeactivated";
  payload: typeof events.StoreDeactivated.schema.Type;
};

type StoreSnapshot = typeof StoreAccountSchema.Type;

export const createStore = (payload: typeof CreateStoreSchema.Type) =>
  Effect.gen(function* () {
    const name = yield* requireName(payload.name);
    const timeZone = yield* requireTimeZone(payload.timeZone);
    const createdAt = yield* now;

    return {
      type: "StoreCreated",
      payload: { name, timeZone, createdAt },
    } satisfies StoreCreatedEvent;
  });

export const renameStore = (
  _snapshot: StoreSnapshot,
  payload: typeof RenameStoreSchema.Type,
) =>
  Effect.gen(function* () {
    const name = yield* requireName(payload.name);
    const updatedAt = yield* now;

    return {
      type: "StoreRenamed",
      payload: { name, updatedAt },
    } satisfies StoreRenamedEvent;
  });

export const changeStoreTimeZone = (
  _snapshot: StoreSnapshot,
  payload: typeof ChangeStoreTimeZoneSchema.Type,
) =>
  Effect.gen(function* () {
    const timeZone = yield* requireTimeZone(payload.timeZone);
    const updatedAt = yield* now;

    return {
      type: "StoreTimeZoneChanged",
      payload: { timeZone, updatedAt },
    } satisfies StoreTimeZoneChangedEvent;
  });

export const activateStore = (snapshot: StoreSnapshot) =>
  Effect.gen(function* () {
    if (snapshot.status === "active") {
      return yield* Effect.fail(new StoreAlreadyActiveError());
    }

    const updatedAt = yield* now;

    return {
      type: "StoreActivated",
      payload: { updatedAt },
    } satisfies StoreActivatedEvent;
  });

export const deactivateStore = (snapshot: StoreSnapshot) =>
  Effect.gen(function* () {
    if (snapshot.status === "inactive") {
      return yield* Effect.fail(new StoreAlreadyInactiveError());
    }

    const updatedAt = yield* now;

    return {
      type: "StoreDeactivated",
      payload: { updatedAt },
    } satisfies StoreDeactivatedEvent;
  });

const now = Effect.flatMap(Clock, (clock) => clock.now);

const requireName = (raw: string) => {
  const name = raw.trim();

  return name.length === 0 ?
      Effect.fail(new StoreNameBlankError())
    : Effect.succeed(name);
};

const requireTimeZone = (raw: string) => {
  const timeZone = raw.trim();

  return timeZone.length === 0 ?
      Effect.fail(new StoreTimeZoneBlankError())
    : Effect.succeed(timeZone);
};
