import { describe, expect, it } from "vitest";
import { getCountryOption, getCountryTimezones, searchCities, searchCountries, validateLocationSelection } from "@/lib/locations";

describe("maintained location dataset", () => {
  it("returns stable ISO country codes", async () => {
    const iran = (await searchCountries("Iran")).find((country) => country.code === "IR");
    expect(iran).toMatchObject({ code: "IR", name: "Iran", iso3: "IRN" });
    expect(await getCountryOption("DE")).toMatchObject({ name: "Germany", code: "DE" });
  });

  it("adds the UK constituent countries without replacing the complete country dataset", async () => {
    const all = await searchCountries("", 400);
    expect(all.length).toBeGreaterThanOrEqual(254);
    expect(new Set(all.map((country) => country.code)).size).toBe(all.length);
    expect(await searchCountries("Scotland")).toContainEqual(expect.objectContaining({ code: "SCT", name: "Scotland" }));
    expect(await searchCountries("England")).toContainEqual(expect.objectContaining({ code: "ENG", name: "England" }));
    expect(await searchCountries("Britain")).toContainEqual(expect.objectContaining({ code: "GB", name: "United Kingdom" }));
  });

  it("searches cities only inside the selected country", async () => {
    const results = await searchCities("IR", "Tehran");
    expect(results.some((city) => city.name === "Tehran")).toBe(true);
    expect(results.every((city) => city.id.startsWith("IR:"))).toBe(true);
  });

  it("filters UK cities into their constituent countries", async () => {
    expect(await searchCities("SCT", "Edinburgh")).toContainEqual(expect.objectContaining({ name: "Edinburgh", stateCode: "EDH" }));
    expect(await searchCities("ENG", "London")).toContainEqual(expect.objectContaining({ name: "London" }));
    expect(await searchCities("WLS", "Cardiff")).toContainEqual(expect.objectContaining({ name: "Cardiff", stateCode: "CRF" }));
    expect(await searchCities("NIR", "Belfast")).toContainEqual(expect.objectContaining({ name: "Belfast", stateCode: "BFS" }));
    expect(await searchCities("SCT", "Cardiff")).toEqual([]);
  });

  it("derives deterministic country timezones", async () => {
    expect(await getCountryTimezones("IR")).toEqual([{ value: "Asia/Tehran", label: "Asia/Tehran" }]);
    expect((await getCountryTimezones("US")).length).toBeGreaterThan(1);
    expect(await getCountryTimezones("SCT")).toEqual([{ value: "Europe/London", label: "Europe/London" }]);
  });

  it("rejects a city or timezone outside the selected country", async () => {
    await expect(validateLocationSelection({ countryCode: "IR", country: "Iran", city: "Tehran", timezone: "Asia/Tehran" })).resolves.toMatchObject({ code: "IR" });
    await expect(validateLocationSelection({ countryCode: "IR", country: "Iran", city: "Berlin", timezone: "Europe/Berlin" })).rejects.toThrow();
    await expect(validateLocationSelection({ countryCode: "SCT", country: "Scotland", city: "Edinburgh", timezone: "Europe/London" })).resolves.toMatchObject({ code: "SCT" });
    await expect(validateLocationSelection({ countryCode: "SCT", country: "Scotland", city: "Cardiff", timezone: "Europe/London" })).rejects.toThrow();
  });
});
