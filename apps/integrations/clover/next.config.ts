import type { NextConfig } from "next";
import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "../../.env"), override: false });

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
