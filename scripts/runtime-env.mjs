const unsafeValues = new Set(["admin", "change-me", "changeme", "password", "postgres", "123456", "secret"]);

function strong(value, minimum) {
  const normalized = value?.trim() ?? "";
  return normalized.length >= minimum && !unsafeValues.has(normalized.toLowerCase()) && !/change[_-]?me|replace[_-]?with|example|development[_-]?only/i.test(normalized);
}

export function productionEnvironmentErrors(env = process.env) {
  const errors = [];
  if (env.NODE_ENV !== "production") errors.push("NODE_ENV must be production");
  if (!strong(env.POSTGRES_PASSWORD, 16)) errors.push("POSTGRES_PASSWORD is missing or unsafe");
  if (!strong(env.AUTH_SECRET, 32)) errors.push("AUTH_SECRET is missing or unsafe");
  if (env.HTTPS_ENABLED !== "true") errors.push("HTTPS_ENABLED must be true");
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !strong(decodeURIComponent(url.password), 16)) throw new Error();
  } catch { errors.push("DATABASE_URL is missing, invalid, or uses an unsafe password"); }
  const bootstrapPresent = Boolean(env.INITIAL_ADMIN_USERNAME?.trim() || env.INITIAL_ADMIN_PASSWORD?.trim());
  if (bootstrapPresent && (!env.INITIAL_ADMIN_USERNAME?.trim() || !strong(env.INITIAL_ADMIN_PASSWORD, 12))) errors.push("Initial administrator bootstrap configuration is incomplete or unsafe");
  return errors;
}

export function assertProductionEnvironment(env = process.env) {
  const errors = productionEnvironmentErrors(env);
  if (errors.length) throw new Error(`Production configuration failed: ${errors.join("; ")}. Secret values were not logged.`);
}
