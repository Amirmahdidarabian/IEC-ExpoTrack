import { boundedFetch } from "./request";

export async function loadSavedItems<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await boundedFetch(fetch, url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(response.status === 403 ? "You no longer have access to these saved items." : "Unable to load saved items. Please try again.");
  const items: unknown = await response.json();
  if (!Array.isArray(items)) throw new Error("The saved items response was invalid. Please try again.");
  return items as T[];
}
