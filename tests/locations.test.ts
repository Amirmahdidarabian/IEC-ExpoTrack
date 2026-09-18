import { describe, expect, it } from "vitest";
import { getCountryOption, getCountryTimezones, searchCities, searchCountries, validateLocationSelection } from "@/lib/locations";

describe("maintained location dataset", () => {
  it("returns stable ISO country codes", async () => {
    const iran = (await searchCountries("Iran")).find((country) => country.code === "IR");
    expect(iran).toMatchObject({ code: "IR", name: "Iran", iso3: "IRN" });
    expect(await getCountryOption("DE")).toMatchObject({ name: "Germany", code: "DE" });
  });

  it("searches cities only inside the selected country", async () => {
    const results = await searchCities("IR", "Tehran");
    expect(results.some((city) => city.name === "Tehran")).toBe(true);
    expect(results.every((city) => city.id.startsWith("IR:"))).toBe(true);
  });

  it("derives deterministic country timezones", async () => {
    expect(await getCountryTimezones("IR")).toEqual([{ value: "Asia/Tehran", label: "Asia/Tehran" }]);
    expect((await getCountryTimezones("US")).length).toBeGreaterThan(1);
  });

  it("rejects a city or timezone outside the selected country", async () => {
    await expect(validateLocationSelection({ countryCode: "IR", country: "Iran", city: "Tehran", timezone: "Asia/Tehran" })).resolves.toMatchObject({ code: "IR" });
    await expect(validateLocationSelection({ countryCode: "IR", country: "Iran", city: "Berlin", timezone: "Europe/Berlin" })).rejects.toThrow();
  });
});
