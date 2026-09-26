export const THEME_STORAGE_KEY = "iec-theme";
export type Theme = "dark" | "light";

export function normalizeTheme(value: unknown): Theme {
  return value === "light" ? "light" : "dark";
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
