import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  serverExternalPackages: ["@countrystatecity/countries"],
};

export default nextConfig;
