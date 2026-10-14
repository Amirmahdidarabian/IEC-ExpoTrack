import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSavedItems } from "@/lib/client/saved";

afterEach(() => vi.unstubAllGlobals());
describe("independent saved collection requests", () => {
  it("loads exhibitions even when the company endpoint fails", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("companies") ? new Response("Forbidden", { status: 403 }) : Response.json([{ id: "saved-1" }]));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const results = await Promise.allSettled([loadSavedItems("/api/exhibitions/saved", controller.signal), loadSavedItems("/api/companies/saved", controller.signal)]);
    expect(results[0]).toEqual({ status: "fulfilled", value: [{ id: "saved-1" }] });
    expect(results[1].status).toBe("rejected");
    expect(fetcher).toHaveBeenCalledWith("/api/exhibitions/saved", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it("does not interpret invalid data as an empty collection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Invalid response" })));
    await expect(loadSavedItems("/api/exhibitions/saved", new AbortController().signal)).rejects.toThrow("invalid");
  });
  it("shows a recoverable error for server failures without exposing response contents", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private server details", { status: 500 })));
    await expect(loadSavedItems("/api/exhibitions/saved", new AbortController().signal)).rejects.toThrow("Please try again");
  });
});
