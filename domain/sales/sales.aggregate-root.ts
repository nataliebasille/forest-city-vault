import { defineAggregateType } from "@forest-city-vault/core-domain";
import { Effect, Schema } from "effect";
import { SaleSchema } from "./sale.entity";
import * as events from "./sale.events";
import { fromCloverPayment, FromCloverPaymentSchema } from "./sale.actions";

export const Sales = defineAggregateType("Sale", {
  id: Schema.String,
  schema: SaleSchema,
  events,
  actions: {
    fromCloverPayment: (payload: typeof FromCloverPaymentSchema.Type) =>
      Effect.succeed(fromCloverPayment(payload)),
  },
});
