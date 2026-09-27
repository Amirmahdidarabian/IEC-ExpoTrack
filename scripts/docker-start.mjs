import { assertProductionEnvironment } from "./runtime-env.mjs";

if (process.env.ALLOW_INSECURE_LOCAL_DEVELOPMENT === "true") {
  console.warn("Production environment validation skipped for loopback-only local Docker development.");
} else {
  assertProductionEnvironment();
}
await import("../server.js");
