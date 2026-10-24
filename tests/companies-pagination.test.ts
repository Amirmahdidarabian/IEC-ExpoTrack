import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ company: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() }, industryCategory: { count: vi.fn(), findMany: vi.fn() }, topic: { findMany: vi.fn() }, exhibition: { findMany: vi.fn() }, $queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks }));
import { listCompanies } from "@/lib/companies/repository";
import { parseCompanyQuery } from "@/lib/companies/query";
describe("company All pagination", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.company.findMany.mockResolvedValue([]); mocks.company.count.mockResolvedValue(412); mocks.company.groupBy.mockResolvedValue([]); mocks.industryCategory.count.mockResolvedValue(0); mocks.industryCategory.findMany.mockResolvedValue([]); mocks.topic.findMany.mockResolvedValue([]); mocks.exhibition.findMany.mockResolvedValue([]); mocks.$queryRaw.mockResolvedValue([]); });
  it("removes the database limit and offset for All but retains the selected folder", async () => {
    const result = await listCompanies(parseCompanyQuery({ folder: "rov", pageSize: "all", page: "999" }));
    expect(mocks.company.findMany.mock.calls[0][0]).toMatchObject({ where: { AND: [{ folders: { some: { folderId: "rov" } } }] }, skip: 0, take: undefined });
    expect(result).toMatchObject({ page: 1, pageSize: "all", pageCount: 1, total: 412 });
  });
  it("retains numeric pagination", async () => {
    await listCompanies(parseCompanyQuery({ pageSize: "100", page: "2" }));
    expect(mocks.company.findMany.mock.calls[0][0]).toMatchObject({ skip: 100, take: 100 });
  });
  it("does not retain a hidden SQL limit in nearest-exhibition sorting", async () => {
    const result = await listCompanies(parseCompanyQuery({ folder: "rov", pageSize: "all", sort: "nearest" }));
    const sql = mocks.$queryRaw.mock.calls[0][0];
    expect(sql.strings.join("")).not.toMatch(/LIMIT|OFFSET/);
    expect(sql.values).toContain("rov"); expect(result.pageCount).toBe(1);
  });
  it("counts the same contact-filtered subset for All and nearest sorting", async () => {
    mocks.$queryRaw.mockResolvedValueOnce([{ id: "company-one" }]).mockResolvedValueOnce([]);
    await listCompanies(parseCompanyQuery({ pageSize: "all", sort: "nearest", minContacts: "2" }));
    expect(mocks.company.count.mock.calls[0][0].where).toMatchObject({ AND: [{}, { id: { in: ["company-one"] } }] });
  });
  it("returns one empty page for an empty All result", async () => {
    mocks.company.count.mockResolvedValue(0);
    expect(await listCompanies(parseCompanyQuery({ pageSize: "all" }))).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1 });
  });
});
