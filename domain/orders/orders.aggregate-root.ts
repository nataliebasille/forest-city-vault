import { defineAggregateType } from "@forest-city-vault/core-domain";
import { Effect, Schema } from "effect";
import { OrderSchema } from "./order.entity";
import * as events from "./order.events";
import {
  fromCloverOrder,
  FromCloverOrderSchema,
  refreshFromCloverOrder,
} from "./order.actions";

export const Orders = defineAggregateType("Order", {
  id: Schema.String,
  schema: OrderSchema,
  events,
  actions: {
    fromCloverOrder: (payload: typeof FromCloverOrderSchema.Type) =>
      Effect.succeed(fromCloverOrder(payload)),
    refreshFromCloverOrder: (
      snapshot: typeof OrderSchema.Type,
      payload: typeof FromCloverOrderSchema.Type,
    ) => Effect.succeed(refreshFromCloverOrder(snapshot, payload)),
  },
});
