import type { NextConfig } from "next";
import path from "path";
import { config as loadEnv } from "dotenv";

// Every app loads environment variables from the repository-root `.env`, so the
// marketing site reads the same file (two levels up from `apps/marketing-site`).
loadEnv({ path: path.resolve(__dirname, "../../.env"), override: false });

const nextConfig: NextConfig = {
  // exceljs relies on Node built-ins; keep it as a runtime dependency instead
  // of bundling it into the server output.
  serverExternalPackages: ["exceljs"],
  // The vendor workbook is read at build time by the cached loader. Trace it so
  // it ships with the deployment and remains readable if the cache is ever
  // rebuilt at runtime.
  outputFileTracingIncludes: {
    "/vendors": ["./src/lib/vendors/vendor-data.xlsx"],
  },
};

export default nextConfig;
