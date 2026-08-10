import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const migrationsFolder = path.resolve(__dirname, "../drizzle");

// First CLI arg selects the env file (relative to repo root); defaults to `.env`
// for local development. Prod runs pass `.env.production`.
const envFileName = process.argv[2] ?? ".env";
const envFile = path.resolve(repoRoot, envFileName);

try {
  loadEnvFile(envFile);
} catch {
  console.error(`Could not load env file: ${envFile}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(`DATABASE_URL is not set in ${envFileName}.`);
  process.exit(1);
}

console.log(`Applying migrations to ${maskConnectionString(connectionString)}`);
console.log(`  (env file: ${envFileName}, migrations: ${migrationsFolder})`);

const client = new pg.Client(buildClientConfig(connectionString));
await client.connect();

const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied successfully.");
} finally {
  await client.end();
}

/**
 * Builds a node-postgres client config from a connection string, translating
 * libpq TLS params that `pg` does not understand into an explicit `ssl` object.
 *
 * PlanetScale's connection string uses `sslmode=verify-full&sslrootcert=system`.
 * The `system` value tells libpq to trust the OS certificate store, but
 * `pg-connection-string` treats `sslrootcert` as a file path and crashes trying
 * to read a file named "system". Node already trusts PlanetScale's public CA
 * chain, so we strip the ssl query params and set `ssl` from `sslmode` instead —
 * `verify-full` maps to full verification (cert chain + hostname), which Node's
 * default `checkServerIdentity` enforces when `rejectUnauthorized` is true.
 */
function buildClientConfig(rawConnectionString: string): pg.ClientConfig {
  let url: URL;
  try {
    url = new URL(rawConnectionString);
  } catch {
    return { connectionString: rawConnectionString };
  }

  const sslmode = url.searchParams.get("sslmode");
  const sslrootcert = url.searchParams.get("sslrootcert");

  for (const param of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
    url.searchParams.delete(param);
  }

  const config: pg.ClientConfig = { connectionString: url.toString() };

  if (sslmode && sslmode !== "disable") {
    // `require` (and `prefer`/`allow`) encrypt without verifying; the `verify-*`
    // modes enforce the certificate chain. A file-backed `sslrootcert` is honored
    // as an explicit CA; `system` (or none) falls back to Node's trust store.
    const verify = sslmode === "verify-ca" || sslmode === "verify-full";
    const ssl: pg.ClientConfig["ssl"] = { rejectUnauthorized: verify };

    if (sslrootcert && sslrootcert !== "system") {
      ssl.ca = readFileSync(sslrootcert, "utf8");
    }

    config.ssl = ssl;
  }

  return config;
}

function maskConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol}//${url.hostname}${port}${url.pathname}`;
  } catch {
    return "the configured database";
  }
}
