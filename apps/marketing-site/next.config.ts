import type { NextConfig } from "next";

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
