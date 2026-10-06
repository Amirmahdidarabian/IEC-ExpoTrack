const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "aol.com", "proton.me", "protonmail.com",
]);

const COUNTRY_ALIASES: Record<string, { code: string; name: string }> = {
  france: { code: "FR", name: "France" }, belgium: { code: "BE", name: "Belgium" }, germany: { code: "DE", name: "Germany" },
  turkey: { code: "TR", name: "Türkiye" }, türkiye: { code: "TR", name: "Türkiye" }, turkiye: { code: "TR", name: "Türkiye" },
  usa: { code: "US", name: "United States" }, "united states": { code: "US", name: "United States" }, "united states of america": { code: "US", name: "United States" },
  uk: { code: "GB", name: "United Kingdom" }, britain: { code: "GB", name: "United Kingdom" }, "united kingdom": { code: "GB", name: "United Kingdom" },
  uae: { code: "AE", name: "United Arab Emirates" }, "united arab emirates": { code: "AE", name: "United Arab Emirates" },
  china: { code: "CN", name: "China" }, india: { code: "IN", name: "India" }, italy: { code: "IT", name: "Italy" }, spain: { code: "ES", name: "Spain" },
  netherlands: { code: "NL", name: "Netherlands" }, norway: { code: "NO", name: "Norway" }, denmark: { code: "DK", name: "Denmark" }, sweden: { code: "SE", name: "Sweden" },
  canada: { code: "CA", name: "Canada" }, australia: { code: "AU", name: "Australia" }, japan: { code: "JP", name: "Japan" }, singapore: { code: "SG", name: "Singapore" },
  iran: { code: "IR", name: "Iran" }, "saudi arabia": { code: "SA", name: "Saudi Arabia" }, qatar: { code: "QA", name: "Qatar" }, oman: { code: "OM", name: "Oman" },
};

export function normalizeCompanyName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function normalizeDomain(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "").replace(/\.$/, "");
    return host && host.includes(".") ? host : null;
  } catch { return null; }
}

export function canonicalWebsite(value: string | null | undefined) {
  const domain = normalizeDomain(value);
  if (!domain) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value!.trim()) ? value!.trim() : `https://${value!.trim()}`);
    return `${url.protocol}//${domain}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`;
  } catch { return `https://${domain}`; }
}

export function corporateDomainFromEmail(email: string | null | undefined) {
  const domain = email?.trim().toLocaleLowerCase("en-US").split("@").at(1) ?? null;
  return domain && !PUBLIC_EMAIL_DOMAINS.has(domain) && domain.includes(".") ? domain : null;
}

export function normalizeCountry(value: string | null | undefined) {
  const raw = value?.normalize("NFKC").trim();
  if (!raw) return null;
  const alias = COUNTRY_ALIASES[raw.toLocaleLowerCase("en-US")];
  if (alias) return alias;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const code = raw.toUpperCase();
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return name && name !== code ? { code, name } : null;
  }
  return null;
}

export function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("en-US") || null;
}

