"use client";

import { Check, ChevronDown, LoaderCircle, Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

export type ComboboxOption = { value: string; label: string; detail?: string };

type Props = {
  value: string;
  selectedLabel?: string;
  options: ComboboxOption[];
  onChange: (option: ComboboxOption | null) => void;
  onSearch?: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  loading?: boolean;
  error?: string;
  emptyText?: string;
  ariaLabel: string;
};

export function SearchableCombobox({ value, selectedLabel = "", options, onChange, onSearch, placeholder = "Search…", disabled = false, readOnly = false, loading = false, error = "", emptyText = "No results found", ariaLabel }: Props) {
  const id = useId();
  const listId = `${id}-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selectedLabel);
  const [active, setActive] = useState(-1);

  const selected = options.find((option) => option.value === value);
  const displayedQuery = open ? query : value ? selected?.label ?? selectedLabel : "";

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    if (!needle || value) return options;
    return options.filter((option) => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase("en-US").includes(needle));
  }, [options, query, value]);

  function select(option: ComboboxOption) {
    onChange(option); setQuery(option.label); setOpen(false); setActive(-1);
  }

  function changeQuery(next: string) {
    setQuery(next); setOpen(true); setActive(-1);
    if (value) onChange(null);
    onSearch?.(next);
  }

  return <div className={`searchable-combobox ${disabled ? "is-disabled" : ""} ${readOnly ? "is-readonly" : ""}`} ref={wrapRef}>
    <Search className="combo-leading" aria-hidden />
    <input
      role="combobox"
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={open && !readOnly}
      aria-controls={listId}
      aria-activedescendant={open && visible[active] ? `${id}-option-${active}` : undefined}
      autoComplete="off"
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      value={displayedQuery}
      onFocus={() => { if (!readOnly) { const next = selected?.label ?? selectedLabel; setQuery(next); setOpen(true); onSearch?.(next); } }}
      onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      onChange={(event) => changeQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0))); }
        if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((index) => index < 0 ? Math.max(visible.length - 1, 0) : Math.max(index - 1, 0)); }
        if (event.key === "Enter" && open && visible[active]) { event.preventDefault(); select(visible[active]); }
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      }}
    />
    {loading ? <LoaderCircle className="combo-spinner" aria-label="Loading" /> : <ChevronDown className="combo-chevron" aria-hidden />}
    {open && !readOnly && <div className="combo-list" id={listId} role="listbox">
      {error ? <p className="combo-state error" role="alert">{error}</p> : loading && !visible.length ? <p className="combo-state">Loading…</p> : !visible.length ? <p className="combo-state">{emptyText}</p> : visible.map((option, index) => <button
        type="button"
        role="option"
        aria-selected={option.value === value}
        id={`${id}-option-${index}`}
        className={index === active ? "active" : ""}
        key={`${option.value}-${index}`}
        onMouseEnter={() => setActive(index)}
        onMouseDown={(event) => { event.preventDefault(); select(option); }}
      ><span>{option.label}{option.detail && <small>{option.detail}</small>}</span>{option.value === value && <Check />}</button>)}
    </div>}
  </div>;
}
