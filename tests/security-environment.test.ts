import { describe, expect, it } from "vitest";
import { getAuthenticationSecret, validateProductionEnvironment } from "@/lib/security/environment";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://iec:VeryStrongDatabasePassword2026@db:5432/iec_expobot",
  POSTGRES_PASSWORD: "VeryStrongDatabasePassword2026",
  AUTH_SECRET: "a-unique-authentication-secret-with-32-characters",
  HTTPS_ENABLED: "true",
} as NodeJS.ProcessEnv;

describe("production environment validation", () => {
  it("accepts complete configuration without returning secret values", () => {
    const result = validateProductionEnvironment(valid);
    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain(valid.AUTH_SECRET);
    expect(JSON.stringify(result)).not.toContain(valid.POSTGRES_PASSWORD);
  });
  it("rejects missing and predictable production secrets", () => {
    const result = validateProductionEnvironment({ ...valid, AUTH_SECRET: "secret", POSTGRES_PASSWORD: "change-me", DATABASE_URL: "postgresql://iec:change-me@db:5432/iec" });
    expect(result.valid).toBe(false);
    expect(result.checks.filter((check) => !check.ok).map((check) => check.key)).toEqual(expect.arrayContaining(["database", "databasePassword", "authSecret"]));
  });
  it("fails closed when a production session secret is missing", () => {
    expect(() => getAuthenticationSecret({ NODE_ENV: "production" })).toThrow("configuration is invalid");
  });
});
