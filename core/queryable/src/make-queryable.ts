import { type Context, Effect, Layer } from "effect";
import type { Queryable } from "./queryable";

/**
 * Builds the {@link Layer} that provides a {@link Queryable} `tag`, threading in
 * whatever the implementation needs to resolve.
 *
 * `query` is an Effect that produces the `query` function from context — for
 * example by reading a database handle — so its requirements `R` become the
 * requirements of the Layer this returns. That is the whole point of the
 * helper: it lets an adapter state "here is how to run a read, given these
 * dependencies" and get back a fully wired Layer, without repeating the
 * tag-and-`Layer.effect` ceremony at every call site.
 */
export function makeQueryable<Self, DB, E, R>(
  tag: Context.Tag<Self, Queryable<DB, E>>,
  query: Effect.Effect<Queryable<DB, E>["query"], never, R>,
): Layer.Layer<Self, never, R> {
  return Layer.effect(
    tag,
    Effect.map(query, (run) => tag.of({ query: run })),
  );
}
