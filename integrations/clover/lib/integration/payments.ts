import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Schema } from "effect";

const CloverPaymentSchema = Schema.Struct({
  id: Schema.String,
  amount: Schema.Number,
  tipAmount: Schema.optional(Schema.Number),
  taxAmount: Schema.optional(Schema.Number),
  result: Schema.optional(Schema.String),
  order: Schema.optional(Schema.Struct({ id: Schema.String })),
});

// export function getCloverPayment();
