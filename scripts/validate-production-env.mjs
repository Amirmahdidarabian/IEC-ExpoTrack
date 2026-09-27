import { existsSync } from "node:fs";
import { productionEnvironmentErrors } from "./runtime-env.mjs";

if (existsSync(".env")) process.loadEnvFile(".env");
const errors = productionEnvironmentErrors();
console.log("IEC production environment");
if (!errors.length) console.log("PASS  Required environment configuration");
for (const error of errors) console.log(`FAIL  ${error}`);
process.exitCode = errors.length ? 1 : 0;
