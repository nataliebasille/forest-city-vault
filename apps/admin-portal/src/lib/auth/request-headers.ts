/**
 * The read-only ambient request headers (Next's `ReadonlyHeaders` or a request's
 * `Headers`), narrowed to what {@link toRequestHeaders} needs.
 */
export type RequestHeaderSource = {
  readonly entries: () => IterableIterator<[string, string]>;
};

/**
 * Copies the ambient request headers into a standard mutable `Headers`, the
 * shape Better Auth's API expects. Next's request headers are read-only and not
 * directly assignable to `Headers`, so we rebuild one from their entries — the
 * `cookie` header (which carries the session) comes along.
 */
export function toRequestHeaders(source: RequestHeaderSource) {
  return new Headers(Object.fromEntries(source.entries()));
}
