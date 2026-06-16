import { defineAggregateType } from "@forest-city-vault/core-domain";
import { Schema } from "effect";
import { SaleSchema } from "./sale.entity";
import * as events from "./sale.events";

export const Sales = defineAggregateType("Sale", {
  id: Schema.String,
  schema: SaleSchema,
  events,
  actions: {},
});
