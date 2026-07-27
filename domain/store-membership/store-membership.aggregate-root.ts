import { defineAggregateType } from "@forest-city-vault/core-domain";
import { Schema } from "effect";
import { StoreMembershipSchema } from "./store-membership.entity";
import * as events from "./store-membership.events";
import {
  changeMembershipRole,
  ChangeMembershipRoleSchema,
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
    changeRole: (
      snapshot: typeof StoreMembershipSchema.Type,
      payload: typeof ChangeMembershipRoleSchema.Type,
    ) => changeMembershipRole(snapshot, payload),
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
