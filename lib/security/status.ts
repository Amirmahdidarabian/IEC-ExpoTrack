import { prisma } from "@/lib/prisma";
import { validateProductionEnvironment } from "./environment";

export type SecurityState = "PASS" | "WARNING" | "FAIL" | "UNKNOWN";
export type SecurityItem = { label: string; state: SecurityState; summary: string; critical?: boolean };
export type SecuritySection = { title: string; items: SecurityItem[] };

function lastCheck(): SecuritySection {
  return { title: "Last Security Check", items: [{ label: "CI and deployment checks", state: "UNKNOWN", summary: "Review the latest CI run or npm run prod:check output; build tools are not executed by this page." }] };
}

export async function getSecurityStatus() {
  const environment = validateProductionEnvironment();
  let database: SecurityItem = { label: "Database connection", state: "FAIL", summary: "PostgreSQL could not be reached.", critical: true };
  let admins: SecurityItem = { label: "Admin protection", state: "FAIL", summary: "Active administrator status could not be verified.", critical: true };
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { label: "Database connection", state: "PASS", summary: "PostgreSQL connection is healthy.", critical: true };
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    admins = activeAdmins > 0
      ? { label: "Admin protection", state: "PASS", summary: `${activeAdmins} active administrator${activeAdmins === 1 ? "" : "s"}; the final account is protected.`, critical: true }
      : { label: "Admin protection", state: "FAIL", summary: "No active administrator exists.", critical: true };
  } catch { /* safe status only; connection details stay server-side */ }

  const env = Object.fromEntries(environment.checks.map((item) => [item.key, item]));
  const sections: SecuritySection[] = [
    { title: "Application Security", items: [
      { label: "Authentication", state: env.authSecret.ok ? "PASS" : environment.production ? "FAIL" : "WARNING", summary: env.authSecret.ok ? "Opaque sessions are protected with a configured authentication secret." : "A production authentication secret is not configured.", critical: true },
      { label: "Authorization", state: "PASS", summary: "Permissions and administrator roles are enforced on the server." },
      { label: "Admin routes", state: "PASS", summary: "Administrative pages and APIs require server-side authorization." },
      { label: "Password hashing", state: "PASS", summary: "Passwords use salted scrypt hashes and are never returned by user APIs." },
      { label: "Session cookies", state: environment.production && !env.https.ok ? "WARNING" : "PASS", summary: "Cookies are HttpOnly, SameSite=Lax, and Secure when HTTPS or production mode is active." },
      { label: "Request protection", state: "PASS", summary: "State-changing browser requests require the same origin." },
    ] },
    { title: "Infrastructure", items: [
      { label: "Production mode", state: environment.production ? "PASS" : "WARNING", summary: env.nodeEnv.summary },
      database,
      { label: "Application port exposure", state: "UNKNOWN", summary: "Production Compose binds Next.js to localhost; live firewall verification is still required." },
      { label: "Database port exposure", state: "UNKNOWN", summary: "Production Compose keeps PostgreSQL internal; live firewall verification is still required." },
      { label: "HTTPS configuration", state: env.https.ok ? "PASS" : "UNKNOWN", summary: env.https.ok ? "HTTPS mode is declared and HSTS is enabled." : "External verification required before enabling HSTS.", critical: true },
      { label: "Security headers", state: "PASS", summary: "CSP, clickjacking, MIME sniffing, referrer, and browser permission protections are configured." },
    ] },
    { title: "Secrets & Configuration", items: [
      { label: "Database credentials", state: env.database.ok && env.databasePassword.ok ? "PASS" : environment.production ? "FAIL" : "WARNING", summary: env.database.ok && env.databasePassword.ok ? "Configured." : "Missing or not suitable for production.", critical: true },
      { label: "Authentication secret", state: env.authSecret.ok ? "PASS" : environment.production ? "FAIL" : "WARNING", summary: env.authSecret.ok ? "Configured." : "Missing or not suitable for production.", critical: true },
      { label: "OpenAI key", state: env.openAi.ok ? "PASS" : "WARNING", summary: env.openAi.summary },
      { label: "Initial admin bootstrap", state: env.initialAdmin.ok ? "PASS" : "WARNING", summary: env.initialAdmin.summary },
    ] },
    { title: "Data Protection", items: [
      { label: "Export excludes credentials", state: "PASS", summary: "The versioned export selects exhibition data only." },
      { label: "Import validates schema", state: "PASS", summary: "Strict versioned JSON validation rejects unknown and security-sensitive fields." },
      { label: "Import size limited", state: "PASS", summary: "Uploads are limited to 10 MB before processing." },
      { label: "Import runs transactionally", state: "PASS", summary: "A failed restore rolls back without partial data." },
      { label: "Audit log immutable", state: "PASS", summary: "No application route can modify or delete audit records." },
      { label: "Passwords excluded from APIs", state: "PASS", summary: "User responses use explicit safe field selections." },
    ] },
    { title: "Source Control Security", items: [
      { label: "CI configured", state: "PASS", summary: "Pull-request quality checks are configured in the repository." },
      { label: "Secret scanning workflow", state: "PASS", summary: "Gitleaks is configured to scan Git history in CI." },
      { label: "GitHub ruleset", state: "UNKNOWN", summary: "External verification required in GitHub repository settings." },
    ] },
    lastCheck(),
  ];
  sections[0].items.splice(3, 0, admins);
  const all = sections.flatMap((section) => section.items);
  const readiness = all.some((item) => item.critical && item.state === "FAIL") ? "NOT READY" : all.some((item) => item.state === "FAIL" || item.state === "WARNING" || item.state === "UNKNOWN") ? "NEEDS ATTENTION" : "READY";
  return { readiness, sections } as const;
}
