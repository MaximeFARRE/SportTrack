import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./scripts/garmin_sync.py", "./.python/**/*"],
  },
};

export default nextConfig;
