import { createRequire } from "node:module";
import type { ICity, ICountry, IState } from "@countrystatecity/countries";

// Force the package's Node/CJS entry. Its lazy city loader uses the package
// directory on disk and must never be bundled into the browser.
const nodeRequire = createRequire(import.meta.url);
const countryData = nodeRequire("@countrystatecity/countries") as typeof import("@countrystatecity/countries");

export type CountryOption = { code: string; name: string; iso3: string; emoji: string };
export type CityOption = { id: string; name: string; stateCode: string; label: string };
export type TimezoneOption = { value: string; label: string };

type CountrySearchOption = CountryOption & { aliases: string[] };
type GbConstituentCode = "ENG" | "SCT" | "WLS" | "NIR";

// The package follows ISO 3166-1, so the four UK constituent countries are
// represented as GB subdivisions. Expose them as location choices while still
// sourcing their cities and timezones from the package's United Kingdom data.
const gbConstituentCountries: Record<GbConstituentCode, CountrySearchOption> = {
  ENG: { code: "ENG", name: "England", iso3: "GBR", emoji: "🇬🇧", aliases: ["United Kingdom", "UK", "Britain", "Great Britain", "British"] },
  SCT: { code: "SCT", name: "Scotland", iso3: "GBR", emoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", aliases: ["United Kingdom", "UK", "Britain", "Great Britain", "Scottish"] },
  WLS: { code: "WLS", name: "Wales", iso3: "GBR", emoji: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", aliases: ["United Kingdom", "UK", "Britain", "Great Britain", "Welsh"] },
  NIR: { code: "NIR", name: "Northern Ireland", iso3: "GBR", emoji: "🇬🇧", aliases: ["United Kingdom", "UK", "Britain", "Great Britain", "Irish"] },
};

// ISO 3166-2 codes for the 22 Welsh principal areas. The package marks both
// English and Welsh areas as "unitary authority", so this small boundary map
// is needed to separate their city collections accurately.
const welshStateCodes = new Set([
  "AGY", "BGW", "BGE", "CAY", "CRF", "CMN", "CGN", "CWY", "DEN", "FLN", "GWN",
  "MTY", "MON", "NTL", "NWP", "PEM", "POW", "RCT", "SWA", "TOF", "VGL", "WRX",
]);

let countriesPromise: Promise<ICountry[]> | undefined;
const citiesCache = new Map<string, Promise<ICity[]>>();
const timezoneCache = new Map<string, Promise<string[]>>();
let gbStatesPromise: Promise<IState[]> | undefined;

async function countries() {
  countriesPromise ??= countryData.getCountries();
  return countriesPromise;
}

function rankByName<T extends { name: string }>(items: T[], query: string) {
  const needle = query.trim().toLocaleLowerCase("en-US");
  if (!needle) return [...items].sort((a, b) => a.name.localeCompare(b.name));
  return items
    .filter((item) => item.name.toLocaleLowerCase("en-US").includes(needle))
    .sort((a, b) => {
      const aName = a.name.toLocaleLowerCase("en-US");
      const bName = b.name.toLocaleLowerCase("en-US");
      return Number(bName.startsWith(needle)) - Number(aName.startsWith(needle)) || a.name.localeCompare(b.name);
    });
}

function isGbConstituentCode(code: string): code is GbConstituentCode {
  return Object.hasOwn(gbConstituentCountries, code);
}

function gbStateBelongsTo(code: GbConstituentCode, state: IState) {
  if (["ENG", "SCT", "WLS", "NIR"].includes(state.iso2)) return false;
  if (code === "SCT") return state.type === "council area";
  if (code === "NIR") return state.type === "district";
  if (code === "WLS") return welshStateCodes.has(state.iso2);
  return state.type !== "council area" && state.type !== "district" && !welshStateCodes.has(state.iso2);
}

async function gbStates() {
  gbStatesPromise ??= countryData.getStatesOfCountry("GB");
  return gbStatesPromise;
}

async function countrySearchOptions(): Promise<CountrySearchOption[]> {
  const standard = (await countries()).map((country) => ({
    code: country.iso2,
    name: country.name,
    iso3: country.iso3,
    emoji: country.emoji,
    aliases: country.iso2 === "GB" ? ["UK", "Britain", "Great Britain", "British"] : [],
  }));
  return [...standard, ...Object.values(gbConstituentCountries)];
}

function toCountryOption(country: CountrySearchOption): CountryOption {
  return { code: country.code, name: country.name, iso3: country.iso3, emoji: country.emoji };
}

export async function getCountryOption(code: string) {
  const normalized = code.trim().toUpperCase();
  if (isGbConstituentCode(normalized)) {
    return toCountryOption(gbConstituentCountries[normalized]);
  }
  const country = (await countries()).find((item) => item.iso2 === normalized);
  return country ? { code: country.iso2, name: country.name, iso3: country.iso3, emoji: country.emoji } : null;
}

export async function searchCountries(query = "", limit = 50): Promise<CountryOption[]> {
  const needle = query.trim().toLocaleLowerCase("en-US");
  const matches = (await countrySearchOptions())
    .filter((country) => !needle || [country.name, country.code, country.iso3, ...country.aliases]
      .some((term) => term.toLocaleLowerCase("en-US").includes(needle)))
    .sort((a, b) => {
      const aTerms = [a.name, a.code, a.iso3, ...a.aliases].map((term) => term.toLocaleLowerCase("en-US"));
      const bTerms = [b.name, b.code, b.iso3, ...b.aliases].map((term) => term.toLocaleLowerCase("en-US"));
      const aStarts = aTerms.some((term) => term.startsWith(needle));
      const bStarts = bTerms.some((term) => term.startsWith(needle));
      return Number(bStarts) - Number(aStarts) || a.name.localeCompare(b.name);
    });
  return matches.slice(0, limit).map(toCountryOption);
}

async function citiesForCountry(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!citiesCache.has(code)) {
    citiesCache.set(code, isGbConstituentCode(code)
      ? gbStates().then(async (states) => (await Promise.all(states
        .filter((state) => gbStateBelongsTo(code, state))
        .map((state) => countryData.getCitiesOfState("GB", state.iso2)))).flat())
      : countryData.getAllCitiesOfCountry(code));
  }
  return citiesCache.get(code)!;
}

export async function searchCities(countryCode: string, query = "", limit = 80): Promise<CityOption[]> {
  const code = countryCode.trim().toUpperCase();
  if (!(await getCountryOption(code))) return [];
  return rankByName(await citiesForCountry(code), query).slice(0, limit).map((city) => ({
    id: `${code}:${city.state_code}:${city.id}`,
    name: city.name,
    stateCode: city.state_code,
    label: city.state_code ? `${city.name} (${city.state_code})` : city.name,
  }));
}

export async function getCountryTimezones(countryCode: string): Promise<TimezoneOption[]> {
  const code = countryCode.trim().toUpperCase();
  if (!(await getCountryOption(code))) return [];
  if (!timezoneCache.has(code)) timezoneCache.set(code, countryData.getCountryTimezones(isGbConstituentCode(code) ? "GB" : code));
  const values = [...new Set(await timezoneCache.get(code)!)].filter((zone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); return true; } catch { return false; }
  });
  return values.sort().map((value) => ({ value, label: value }));
}

export async function validateLocationSelection(input: { countryCode: string; country: string; city: string; timezone: string }) {
  const country = await getCountryOption(input.countryCode);
  if (!country || country.name !== input.country.trim()) throw new Error("Select a valid country from the list.");
  if (input.city.trim()) {
    const exactCity = (await citiesForCountry(country.code)).some((city) => city.name.toLocaleLowerCase("en-US") === input.city.trim().toLocaleLowerCase("en-US"));
    if (!exactCity) throw new Error("Select a city that belongs to the selected country.");
  }
  const timezones = await getCountryTimezones(country.code);
  if (!timezones.some((zone) => zone.value === input.timezone)) throw new Error("Select a timezone for the selected country.");
  if (timezones.length === 1 && input.timezone !== timezones[0].value) throw new Error("The timezone must match the selected country.");
  return country;
}
