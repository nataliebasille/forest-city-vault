import { Schema } from "effect";

export const CentsSchema = Schema.Number.pipe(
  Schema.int({
    message: () => "Cents must be an integer",
  }),
  Schema.positive({
    message: () => "Cents must be a positive number",
  }),
);
