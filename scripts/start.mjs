import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) {
  throw new Error("Production build not found. Run `npm run build` before `npm run start`.");
}

// Load runtime configuration from the project root. Environment variables
// supplied by Docker/PM2 take precedence over values in this local file.
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true, force: true });
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true, force: true });

await import("../.next/standalone/server.js");
