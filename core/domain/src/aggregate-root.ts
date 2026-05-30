export type AggregateRoot<Props extends Record<string, unknown>> = {
  id: string;
} & Props;
