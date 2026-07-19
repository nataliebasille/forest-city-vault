/**
 * Text normalization shared by the build-time vendor processor and the runtime
 * search. Keeping a single implementation guarantees the `searchKey` baked into
 * `vendors.json` is normalized exactly the same way as incoming search queries.
 */

/**
 * Lowercase, strip diacritics, and reduce every run of non-alphanumeric
 * characters to a single space. Produces a clean, space-delimited token string.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Split normalized text into unique, non-empty tokens. */
export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized ? normalized.split(" ") : [];
}

/**
 * Build a vendor's search key from arbitrary text parts (name, item names,
 * etc.). Tokens are de-duplicated while preserving first-seen order so the key
 * stays compact even for vendors with hundreds of similarly named items.
 */
export function buildSearchKey(parts: Iterable<string>): string {
  const seen = new Set<string>();
  for (const part of parts) {
    for (const token of tokenize(part)) {
      seen.add(token);
    }
  }
  return [...seen].join(" ");
}

/** URL-safe slug derived from a display name. */
export function slugify(name: string): string {
  return normalizeText(name).replace(/\s+/g, "-");
}
