import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("application health endpoint", () => {
  it("returns only a minimal non-sensitive status", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
