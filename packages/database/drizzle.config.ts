import { defineConfig } from "drizzle-kit";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile("../../.env");
} catch {}

export default defineConfig({
  schema: ["./src/drizzle-flat.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
