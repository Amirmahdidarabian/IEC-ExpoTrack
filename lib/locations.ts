import { createRequire } from "node:module";
import type { ICity, ICountry } from "@countrystatecity/countries";

// Force the package's Node/CJS entry. Its lazy city loader uses the package
// directory on disk and must never be bundled into the browser.
const nodeRequire = createRequire(import.meta.url);
const countryData = nodeRequire("@countrystatecity/countries") as typeof import("@countrystatecity/countries");

export type CountryOption = { code: string; name: string; iso3: string; emoji: string };
export type CityOption = { id: string; name: string; stateCode: string; label: string };
export type TimezoneOption = { value: string; label: string };

let countriesPromise: Promise<ICountry[]> | undefined;
const citiesCache = new Map<string, Promise<ICity[]>>();
const timezoneCache = new Map<string, Promise<string[]>>();

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

export async function getCountryOption(code: string) {
  const normalized = code.trim().toUpperCase();
  const country = (await countries()).find((item) => item.iso2 === normalized);
  return country ? { code: country.iso2, name: country.name, iso3: country.iso3, emoji: country.emoji } : null;
}

export async function searchCountries(query = "", limit = 50): Promise<CountryOption[]> {
  return rankByName(await countries(), query).slice(0, limit).map((country) => ({ code: country.iso2, name: country.name, iso3: country.iso3, emoji: country.emoji }));
}

async function citiesForCountry(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!citiesCache.has(code)) citiesCache.set(code, countryData.getAllCitiesOfCountry(code));
  return citiesCache.get(code)!;
}

export async function searchCities(countryCode: string, query = "", limit = 80): Promise<CityOption[]> {
  if (!(await getCountryOption(countryCode))) return [];
  return rankByName(await citiesForCountry(countryCode), query).slice(0, limit).map((city) => ({
    id: `${city.country_code}:${city.state_code}:${city.id}`,
    name: city.name,
    stateCode: city.state_code,
    label: city.state_code ? `${city.name} (${city.state_code})` : city.name,
  }));
}

export async function getCountryTimezones(countryCode: string): Promise<TimezoneOption[]> {
  const code = countryCode.trim().toUpperCase();
  if (!(await getCountryOption(code))) return [];
  if (!timezoneCache.has(code)) timezoneCache.set(code, countryData.getCountryTimezones(code));
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
