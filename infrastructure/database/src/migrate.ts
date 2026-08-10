import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { parseConnectionString } from "./utils/connection-ssl";

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
 * libpq TLS params (e.g. PlanetScale's `sslmode=verify-full&sslrootcert=system`)
 * into an explicit `ssl` config that `pg` understands. See
 * {@link parseConnectionString} for the details.
 */
function buildClientConfig(rawConnectionString: string): pg.ClientConfig {
  const { url, ssl } = parseConnectionString(rawConnectionString);
  return { connectionString: url, ssl };
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
