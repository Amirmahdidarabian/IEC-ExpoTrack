"use client";

import { Globe2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ExhibitionInput } from "@/lib/exhibitions/types";
import { SearchableCombobox, type ComboboxOption } from "./SearchableCombobox";

type Props = { value: ExhibitionInput; onChange: (value: ExhibitionInput) => void; errors: Record<string, string> };

async function readOptions(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to load options.");
  return payload;
}

export function LocationFields({ value, onChange, errors }: Props) {
  const [countries, setCountries] = useState<ComboboxOption[]>([]);
  const [cities, setCities] = useState<ComboboxOption[]>([]);
  const [countryLoading, setCountryLoading] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [countryError, setCountryError] = useState("");
  const [cityError, setCityError] = useState("");
  const countryRequest = useRef(0);
  const cityRequest = useRef(0);

  async function findCountries(query: string) {
    const request = ++countryRequest.current;
    setCountryLoading(true); setCountryError("");
    try {
      const payload = await readOptions(`/api/locations/countries?q=${encodeURIComponent(query)}`) as Array<{ code: string; name: string; iso3: string; emoji: string }>;
      if (request === countryRequest.current) setCountries(payload.map((item) => ({ value: item.code, label: item.name, detail: `${item.emoji} ${item.code}` })));
    } catch (caught) { if (request === countryRequest.current) setCountryError(caught instanceof Error ? caught.message : "Unable to load countries."); }
    finally { if (request === countryRequest.current) setCountryLoading(false); }
  }

  async function findCities(query: string, code = value.countryCode) {
    if (!code) { setCities([]); return; }
    const request = ++cityRequest.current;
    setCityLoading(true); setCityError("");
    try {
      const payload = await readOptions(`/api/locations/cities?country=${encodeURIComponent(code)}&q=${encodeURIComponent(query)}`) as Array<{ name: string; label: string; stateCode: string }>;
      if (request === cityRequest.current) setCities(payload.map((item) => ({ value: item.name, label: item.label, detail: item.stateCode })));
    } catch (caught) { if (request === cityRequest.current) setCityError(caught instanceof Error ? caught.message : "Unable to load cities."); }
    finally { if (request === cityRequest.current) setCityLoading(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void findCountries(value.country || ""), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!value.countryCode) return; const timer = window.setTimeout(() => void findCities(value.city || "", value.countryCode), 0); return () => window.clearTimeout(timer); }, [value.countryCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <label className="field"><span>Country *</span><SearchableCombobox ariaLabel="Country" value={value.countryCode} selectedLabel={value.country} options={countries} loading={countryLoading} error={countryError} onSearch={findCountries} placeholder="Search country" onChange={(option) => onChange({ ...value, countryCode: option?.value ?? "", country: option?.label ?? "", city: "", timezone: "" })} />{errors.countryCode && <em>{errors.countryCode}</em>}{errors.country && <em>{errors.country}</em>}</label>
    <label className="field"><span>City</span><SearchableCombobox ariaLabel="City" value={value.city} selectedLabel={value.city} options={cities} loading={cityLoading} error={cityError} disabled={!value.countryCode} onSearch={(query) => findCities(query)} placeholder={value.countryCode ? "Search city" : "Select a country first"} onChange={(option) => onChange({ ...value, city: option?.value ?? "" })} />{errors.city && <em>{errors.city}</em>}</label>
    <label className="field"><span>Venue</span><div className="input-with-icon"><Globe2 /><input value={value.venue} onChange={(event) => onChange({ ...value, venue: event.target.value })} placeholder="e.g. Singapore EXPO" /></div></label>
    <label className="field"><span>Address</span><div className="input-with-icon"><MapPin /><input value={value.address} onChange={(event) => onChange({ ...value, address: event.target.value })} placeholder="Street address or venue location" /></div></label>
  </>;
}

export function TimezoneField({ value, onChange, error = "" }: { value: ExhibitionInput; onChange: (value: ExhibitionInput) => void; error?: string }) {
  const [timezones, setTimezones] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!value.countryCode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setLoadError("");
      void readOptions(`/api/locations/timezones?country=${encodeURIComponent(value.countryCode)}`, controller.signal)
        .then((payload: Array<{ value: string; label: string }>) => {
          setTimezones(payload);
          const validCurrent = payload.some((zone) => zone.value === value.timezone);
          const nextTimezone = payload.length === 1 ? payload[0].value : validCurrent ? value.timezone : "";
          if (nextTimezone !== value.timezone) onChange({ ...value, timezone: nextTimezone });
        })
        .catch((caught) => { if (caught instanceof Error && caught.name !== "AbortError") setLoadError(caught.message); })
        .finally(() => setLoading(false));
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value.countryCode]); // eslint-disable-line react-hooks/exhaustive-deps
  return <label className="field"><span>Timezone *</span><SearchableCombobox ariaLabel="Timezone" value={value.timezone} selectedLabel={value.timezone} options={timezones} loading={loading} error={loadError} disabled={!value.countryCode || loading} readOnly={timezones.length === 1} placeholder={!value.countryCode ? "Select a country first" : timezones.length > 1 ? "Search timezone" : "Timezone is set from country"} onChange={(option) => onChange({ ...value, timezone: option?.value ?? "" })} />{timezones.length === 1 && <small className="field-help">Automatically selected from the country.</small>}{timezones.length > 1 && <small className="field-help">This country has multiple timezones; choose one.</small>}{error && <em>{error}</em>}</label>;
}
