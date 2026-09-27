export type EnvironmentCheck = {
  key: "nodeEnv" | "database" | "databasePassword" | "authSecret" | "openAi" | "initialAdmin" | "https";
  ok: boolean;
  required: boolean;
  label: string;
  summary: string;
};

const unsafeValues = new Set(["admin", "change-me", "changeme", "password", "postgres", "123456", "secret"]);

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

function strongSecret(value: string | undefined, minimumLength: number) {
  const normalized = value?.trim() ?? "";
  return normalized.length >= minimumLength && !unsafeValues.has(normalized.toLowerCase()) && !/change[_-]?me|replace[_-]?with|example|development[_-]?only/i.test(normalized);
}

function databaseUrlIsSafe(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname) && strongSecret(decodeURIComponent(url.password), 16);
  } catch {
    return false;
  }
}

export function validateProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const bootstrapConfigured = configured(env.INITIAL_ADMIN_USERNAME) || configured(env.INITIAL_ADMIN_PASSWORD);
  const bootstrapValid = !bootstrapConfigured || (configured(env.INITIAL_ADMIN_USERNAME) && strongSecret(env.INITIAL_ADMIN_PASSWORD, 12));
  const checks: EnvironmentCheck[] = [
    { key: "nodeEnv", ok: production, required: true, label: "Production mode", summary: production ? "Application is running in production mode." : "Application is not running in production mode." },
    { key: "database", ok: databaseUrlIsSafe(env.DATABASE_URL), required: true, label: "Database credentials", summary: databaseUrlIsSafe(env.DATABASE_URL) ? "Configured with a PostgreSQL URL and a non-default password." : "Missing, invalid, or using an unsafe password." },
    { key: "databasePassword", ok: strongSecret(env.POSTGRES_PASSWORD, 16), required: true, label: "PostgreSQL password", summary: strongSecret(env.POSTGRES_PASSWORD, 16) ? "Configured with a non-default value." : "Missing or too predictable." },
    { key: "authSecret", ok: strongSecret(env.AUTH_SECRET, 32), required: true, label: "Authentication secret", summary: strongSecret(env.AUTH_SECRET, 32) ? "Configured with an acceptable length." : "Missing, too short, or too predictable." },
    { key: "openAi", ok: configured(env.OPENAI_API_KEY), required: false, label: "OpenAI key", summary: configured(env.OPENAI_API_KEY) ? "Configured." : "Not configured; verified demo research remains available." },
    { key: "initialAdmin", ok: bootstrapValid, required: false, label: "Initial admin bootstrap", summary: !bootstrapConfigured ? "Disabled, as recommended after the first administrator is created." : bootstrapValid ? "Configured for first-deployment bootstrap." : "Incomplete or using an unsafe temporary password." },
    { key: "https", ok: env.HTTPS_ENABLED === "true", required: true, label: "HTTPS configuration", summary: env.HTTPS_ENABLED === "true" ? "HTTPS mode is enabled." : "HTTPS has not been declared active." },
  ];
  return { production, checks, valid: checks.filter((check) => check.required).every((check) => check.ok) };
}

export function getAuthenticationSecret(env: NodeJS.ProcessEnv = process.env) {
  if (strongSecret(env.AUTH_SECRET, 32)) return env.AUTH_SECRET!;
  if (env.NODE_ENV === "production") throw new Error("Production authentication configuration is invalid.");
  return "iec-development-session-secret-not-for-production";
}
