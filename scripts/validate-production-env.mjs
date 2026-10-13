import { existsSync } from "node:fs";
import { productionEnvironmentErrors } from "./runtime-env.mjs";

const envIndex = process.argv.indexOf("--env-file");
const envFile = envIndex === -1 ? ".env" : process.argv[envIndex + 1];
if (envIndex !== -1 && (!envFile || !existsSync(envFile))) {
  console.error("Production environment file was not found. Secret values were not logged.");
  process.exit(1);
}
if (existsSync(envFile)) {
  // Validate the selected file in isolation; stale development shell variables
  // must not mask an invalid production configuration.
  if (envIndex !== -1) {
    const { parseEnv } = await import("node:util");
    const { readFileSync } = await import("node:fs");
    const selected = parseEnv(readFileSync(envFile, "utf8"));
    const errors = productionEnvironmentErrors(selected);
    console.log("IEC production environment (selected file)");
    if (!errors.length) console.log("PASS  Required environment configuration");
    for (const error of errors) console.log(`FAIL  ${error}`);
    process.exit(errors.length ? 1 : 0);
  }
  process.loadEnvFile(envFile);
}
const errors = productionEnvironmentErrors();
console.log("IEC production environment");
if (!errors.length) console.log("PASS  Required environment configuration");
for (const error of errors) console.log(`FAIL  ${error}`);
process.exitCode = errors.length ? 1 : 0;
