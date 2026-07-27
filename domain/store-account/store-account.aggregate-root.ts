import { defineAggregateType } from "@forest-city-vault/core-domain";
import { Schema } from "effect";
import { StoreAccountSchema } from "./store-account.entity";
import * as events from "./store-account.events";
import {
  activateStore,
  changeStoreTimeZone,
  ChangeStoreTimeZoneSchema,
  createStore,
  CreateStoreSchema,
  deactivateStore,
  renameStore,
  RenameStoreSchema,
} from "./store-account.actions";

export const StoreAccount = defineAggregateType("StoreAccount", {
  id: Schema.String,
  schema: StoreAccountSchema,
  events,
  actions: {
    create: (payload: typeof CreateStoreSchema.Type) => createStore(payload),
    rename: (
      snapshot: typeof StoreAccountSchema.Type,
      payload: typeof RenameStoreSchema.Type,
    ) => renameStore(snapshot, payload),
    changeTimeZone: (
      snapshot: typeof StoreAccountSchema.Type,
      payload: typeof ChangeStoreTimeZoneSchema.Type,
    ) => changeStoreTimeZone(snapshot, payload),
    activate: (snapshot: typeof StoreAccountSchema.Type, _payload: undefined) =>
      activateStore(snapshot),
    deactivate: (
      snapshot: typeof StoreAccountSchema.Type,
      _payload: undefined,
    ) => deactivateStore(snapshot),
  },
});
