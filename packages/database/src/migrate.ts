import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

try {
  loadEnvFile("../../.env");
} catch {}

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../drizzle");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied successfully.");
} finally {
  await client.end();
}
