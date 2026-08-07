import { defineAggregateType } from "@forest-city-vault/core-domain";
import { Schema } from "effect";
import { VendorSchema } from "./vendor.entity";
import * as events from "./vendor.events";
import {
  activateVendor,
  CreateVendorSchema,
  createVendor,
  deactivateVendor,
  LinkCloverCategorySchema,
  linkCloverCategory,
  RenameVendorSchema,
  renameVendor,
  SyncCloverItemsSchema,
  syncCloverItems,
} from "./vendor.actions";

export const Vendor = defineAggregateType("Vendor", {
  id: Schema.String,
  schema: VendorSchema,
  events,
  actions: {
    create: (payload: typeof CreateVendorSchema.Type) => createVendor(payload),
    rename: (
      snapshot: typeof VendorSchema.Type,
      payload: typeof RenameVendorSchema.Type,
    ) => renameVendor(snapshot, payload),
    linkCloverCategory: (
      snapshot: typeof VendorSchema.Type,
      payload: typeof LinkCloverCategorySchema.Type,
    ) => linkCloverCategory(snapshot, payload),
    syncCloverItems: (
      snapshot: typeof VendorSchema.Type,
      payload: typeof SyncCloverItemsSchema.Type,
    ) => syncCloverItems(snapshot, payload),
    activate: (snapshot: typeof VendorSchema.Type, _payload: undefined) =>
      activateVendor(snapshot),
    deactivate: (snapshot: typeof VendorSchema.Type, _payload: undefined) =>
      deactivateVendor(snapshot),
  },
});
