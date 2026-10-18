import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaTable } from "@/components/media/MediaTable";
import type { MediaList } from "@/lib/media/types";

describe("Media list contact presentation", () => {
  it("shows the contact-count action without names or role summaries underneath", () => {
    const result: MediaList = {
      page: 1, pageSize: 25, pageCount: 1, total: 1,
      stats: { outlets: 1, contacts: 15, locations: 1 },
      items: [{
        id: "publication-1", name: "Example Publication", websiteUrl: "https://example.com/", domain: "example.com",
        sourceCategoryRaw: "Energy", countryCode: "US", countryName: "United States", publicationScopeRaw: null,
        createdAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:00.000Z", categories: [], _count: undefined,
        contactsCount: 15, contacts: [{ id: "contact-1", name: "Contact Person", roleLabel: "VP of Content Strategy", contactMethod: "EMAIL" }],
      }],
    };
    const html = renderToStaticMarkup(<MediaTable result={result} selected={null} searchParams="" pending={false} menu={null}
      abilities={{ canCreate: false, canUpdate: false, canDelete: false, canImport: false, canManageTaxonomy: false }}
      onMenu={() => {}} onOpen={() => {}} onEdit={() => {}} onDelete={() => {}} />);
    expect(html).toContain('aria-label="View 15 contacts for Example Publication"');
    expect(html).not.toContain("VP of Content Strategy");
    expect(html).not.toContain("Contact Person");
    expect(html).not.toContain("media-role-summary");
    expect(result.items[0].contacts[0].roleLabel).toBe("VP of Content Strategy");
  });
});
