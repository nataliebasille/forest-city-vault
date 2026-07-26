import type { NextConfig } from "next";
import path from "path";
import { config as loadEnv } from "dotenv";

// Every app loads environment variables from the repository-root `.env`, so the
// admin portal reads the same file (two levels up from `apps/admin-portal`).
loadEnv({ path: path.resolve(__dirname, "../../.env"), override: false });

const nextConfig: NextConfig = {};

export default nextConfig;
