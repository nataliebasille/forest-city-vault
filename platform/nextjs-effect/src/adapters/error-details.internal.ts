/**
 * Reduces an arbitrary failure into a small, log-safe shape. Keeps just enough to
 * diagnose an error (name/message for `Error`, `_tag` for tagged errors) without
 * risking leaking large payloads or sensitive fields into logs.
 */
export function toSafeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === "object" && error !== null && "_tag" in error) {
    return {
      tag: String((error as { _tag?: unknown })._tag),
    };
  }

  return {
    type: typeof error,
  };
}
