import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { CompanyFolderBreadcrumb, CompanyFolderPicker, CompanyFolders } from "@/components/companies/CompanyFolders";
const folders = [{ id: "one", name: "ROV Subsea", color: "cyan", companyCount: 12 }, { id: "two", name: "UXO", color: "violet", companyCount: 4 }];
describe("company folder interface", () => {
  it("opens with folder rows, links to collections and places the create button below the list", () => {
    const html = renderToStaticMarkup(<CompanyFolders folders={folders} total={14} unfiled={1} canManage />);
    expect(html).toContain('href="/companies?folder=one"'); expect(html).toContain('href="/companies?folder=two"');
    expect(html).toContain('href="/companies?folder=all"'); expect(html).toContain('href="/companies?folder=unfiled"');
    expect(html.indexOf("company-folder-add")).toBeGreaterThan(html.indexOf("UXO"));
    expect(html).toContain('aria-label="Edit folder ROV Subsea"');
  });
  it("does not expose mutation buttons to read-only users", () => {
    const html = renderToStaticMarkup(<CompanyFolders folders={folders} total={14} unfiled={1} canManage={false} />);
    expect(html).not.toContain("company-folder-actions"); expect(html).not.toContain("company-folder-add");
  });
  it("renders multiple memberships as independently checked choices", () => {
    const html = renderToStaticMarkup(<CompanyFolderPicker folders={folders} value={["one", "two"]} onChange={() => {}} />);
    expect(html.match(/checked=""/g)).toHaveLength(2); expect(html).toContain("A company can belong to more than one folder.");
  });
  it("provides an empty-state and a clear return to folders", () => {
    expect(renderToStaticMarkup(<CompanyFolders folders={[]} total={0} unfiled={0} canManage />)).toContain("Create your first folder");
    const html = renderToStaticMarkup(<CompanyFolderBreadcrumb name="ROV & Subsea" />);
    expect(html).toContain('href="/companies"'); expect(html).toContain("ROV &amp; Subsea");
  });
});
