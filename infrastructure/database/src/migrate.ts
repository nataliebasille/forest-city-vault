import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
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

const client = new pg.Client({ connectionString });
await client.connect();

const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied successfully.");
} finally {
  await client.end();
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
