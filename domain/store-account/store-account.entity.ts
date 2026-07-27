import { Schema } from "effect";

export const StoreStatusSchema = Schema.Literal("active", "inactive");
export type StoreStatus = typeof StoreStatusSchema.Type;

/**
 * Forest City Vault only ever settles in one currency today. It is modelled as a
 * fixed literal (never a free `string`) so it cannot drift and so "currency
 * cannot be changed after creation" is enforced by the type system — there is
 * simply no other value to change it to, and no action that sets it.
 */
export const StoreCurrencySchema = Schema.Literal("USD");
export type StoreCurrency = typeof StoreCurrencySchema.Type;

export const StoreAccountSchema = Schema.Struct({
  name: Schema.String,
  status: StoreStatusSchema,
  currency: StoreCurrencySchema,
  timeZone: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
});

export type StoreAccountSnapshot = typeof StoreAccountSchema.Type;
