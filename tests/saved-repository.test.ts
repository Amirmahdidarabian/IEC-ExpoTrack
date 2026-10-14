import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn<(query: unknown) => Promise<unknown[]>>(async () => []) }));
vi.mock("@/lib/prisma", () => ({ prisma: { exhibition: { findMany: mocks.findMany } } }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("saved database query", () => {
  it("filters before loading records, without catalog pagination", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unused-test-database");
    vi.resetModules();
    const { listSavedExhibitions } = await import("@/lib/exhibitions/repository");
    expect(await listSavedExhibitions()).toEqual([]);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { saved: true }, include: expect.any(Object) }));
    expect(mocks.findMany.mock.calls[0][0]).not.toHaveProperty("take");
    expect(mocks.findMany.mock.calls[0][0]).not.toHaveProperty("skip");
  });
});
