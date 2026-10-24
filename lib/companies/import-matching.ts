export type CompanyIdentity = { id: string; normalizedName: string; domain: string | null; countryCode: string | null };
type IdentityInput = Omit<CompanyIdentity, "id">;
export type CompanyMatch = { kind: "new" } | { kind: "match"; id: string } | { kind: "ambiguous"; reason: string };

/** Exact identities only. Shared websites, contradictory countries/domains and missing evidence are not auto-merged. */
export function matchImportedCompany(row: IdentityInput, existing: CompanyIdentity[]): CompanyMatch {
  const domains = row.domain ? existing.filter((item) => item.domain === row.domain) : [];
  const names = existing.filter((item) => item.normalizedName === row.normalizedName);
  if (domains.length > 1) return { kind: "ambiguous", reason: "Multiple existing companies share this domain." };
  if (domains.length === 1) {
    const item = domains[0];
    if (item.normalizedName !== row.normalizedName) return { kind: "ambiguous", reason: "Website matches a differently named company; review manually." };
    if (item.countryCode && row.countryCode && item.countryCode !== row.countryCode) return { kind: "ambiguous", reason: "Website/name matches but the countries conflict." };
    if (names.some((other) => other.id !== item.id && other.countryCode === row.countryCode)) return { kind: "ambiguous", reason: "Website and company name point to conflicting records." };
    return { kind: "match", id: item.id };
  }
  const sameCountry = row.countryCode ? names.filter((item) => item.countryCode === row.countryCode) : [];
  if (sameCountry.length > 1) return { kind: "ambiguous", reason: "Multiple companies match the name and country." };
  if (sameCountry.length === 1) {
    if (row.domain && sameCountry[0].domain && row.domain !== sameCountry[0].domain) return { kind: "ambiguous", reason: "Name/country matches but website domains conflict." };
    return { kind: "match", id: sameCountry[0].id };
  }
  if (names.some((item) => !item.countryCode || !row.countryCode)) return { kind: "ambiguous", reason: "Matching name has insufficient country/website evidence." };
  return { kind: "new" };
}
