import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dictionary is read from disk at runtime; make sure it ships with the API functions.
  outputFileTracingIncludes: {
    "/api/games/*": ["./data/**/*"],
    "/api/games/[id]/action": ["./data/**/*"],
  },
};

export default nextConfig;
