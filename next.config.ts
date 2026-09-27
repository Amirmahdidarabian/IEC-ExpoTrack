import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./lib/security/headers";

const production = process.env.NODE_ENV === "production";
const httpsEnabled = process.env.HTTPS_ENABLED === "true";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  serverExternalPackages: ["@countrystatecity/countries"],
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders({ production, httpsEnabled }) }];
  },
};

export default nextConfig;
