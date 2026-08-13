import type { NextConfig } from "next";
import path from "path";
import { config as loadEnv } from "dotenv";

// Every app loads environment variables from the repository-root `.env`, so the
// marketing site reads the same file (two levels up from `apps/marketing-site`).
// This is where `DATABASE_URL` comes from for the vendor data loader.
loadEnv({ path: path.resolve(__dirname, "../../.env"), override: false });

const nextConfig: NextConfig = {};

export default nextConfig;
