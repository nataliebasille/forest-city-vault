import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";

export type ParsedConnectionString = {
  /**
   * The connection string with libpq TLS query params (`sslmode`, `sslrootcert`,
   * `sslcert`, `sslkey`) removed, safe to hand to `node-postgres`.
   */
  readonly url: string;
  /**
   * Explicit TLS config derived from the stripped `sslmode`/`sslrootcert`, or
   * `undefined` when the connection is not encrypted.
   */
  readonly ssl: boolean | ConnectionOptions | undefined;
};

/**
 * Normalizes a Postgres connection string for `node-postgres` (`pg`), translating
 * libpq TLS params that the driver does not understand into an explicit `ssl`
 * config.
 *
 * PlanetScale's connection string uses `sslmode=verify-full&sslrootcert=system`.
 * The `system` value tells libpq to trust the OS certificate store, but
 * `pg-connection-string` treats `sslrootcert` as a file path and crashes trying
 * to read a file named "system". Node already trusts PlanetScale's public CA
 * chain, so we strip the ssl query params and set `ssl` from `sslmode` instead —
 * `verify-full`/`verify-ca` map to full verification (which Node's default
 * `checkServerIdentity` enforces when `rejectUnauthorized` is true), while
 * `require`/`prefer`/`allow` encrypt without verifying.
 *
 * Both the runtime `PgClient` and the drizzle migrator route through `pg`, so
 * they share this helper to stay consistent (and resilient to password
 * rotations, which keep the same TLS params).
 */
export function parseConnectionString(
  rawConnectionString: string,
): ParsedConnectionString {
  let url: URL;
  try {
    url = new URL(rawConnectionString);
  } catch {
    return { url: rawConnectionString, ssl: undefined };
  }

  const sslmode = url.searchParams.get("sslmode");
  const sslrootcert = url.searchParams.get("sslrootcert");

  for (const param of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
    url.searchParams.delete(param);
  }

  const cleanedUrl = url.toString();

  if (!sslmode || sslmode === "disable") {
    return { url: cleanedUrl, ssl: undefined };
  }

  const verify = sslmode === "verify-ca" || sslmode === "verify-full";
  const ssl: ConnectionOptions = { rejectUnauthorized: verify };

  // A file-backed `sslrootcert` is honored as an explicit CA; `system` (or none)
  // falls back to Node's built-in trust store.
  if (sslrootcert && sslrootcert !== "system") {
    ssl.ca = readFileSync(sslrootcert, "utf8");
  }

  return { url: cleanedUrl, ssl };
}
