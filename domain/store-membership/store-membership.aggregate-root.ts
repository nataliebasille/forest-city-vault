import { defineAggregateType } from "@forest-city-vault/core-domain";
import { Schema } from "effect";
import { StoreMembershipSchema } from "./store-membership.entity";
import * as events from "./store-membership.events";
import {
  createMembership,
  CreateMembershipSchema,
  disableMembership,
  reactivateMembership,
} from "./store-membership.actions";

export const StoreMembership = defineAggregateType("StoreMembership", {
  id: Schema.String,
  schema: StoreMembershipSchema,
  events,
  actions: {
    create: (payload: typeof CreateMembershipSchema.Type) =>
      createMembership(payload),
    disable: (
      snapshot: typeof StoreMembershipSchema.Type,
      _payload: undefined,
    ) => disableMembership(snapshot),
    reactivate: (
      snapshot: typeof StoreMembershipSchema.Type,
      _payload: undefined,
    ) => reactivateMembership(snapshot),
  },
});
