import type { FullBackupDocument } from "@/lib/data-management/schema";

export function fullBackup(): FullBackupDocument {
  const date = "2026-10-24T00:00:00.000Z", dates = { createdAt: date, updatedAt: date };
  const note = { id: "note-1", body: "Follow up next week", createdById: "user-1", ...dates };
  return {
    format: "iec-expotrack", version: 2, exportedAt: date,
    data: {
      categories: [{ id: "cat-1", name: "Energy", normalizedName: "energy", slug: "energy", ...dates }], topics: [{ id: "topic-1", name: "Offshore", normalizedName: "offshore", slug: "offshore", ...dates }],
      exhibitions: [{ id: "expo-1", slug: "energy-2027", name: "Energy Expo", tagline: "", industry: "Energy", eventType: "Exhibition", country: "Germany", countryCode: "DE", city: "Berlin", venue: "IEC", address: "", startDate: "2027-01-01T00:00:00.000Z", endDate: null, timezone: "UTC", organizer: "IEC", website: "https://example.com", description: "Description", aiReport: "Report", topics: ["Offshore"], saved: true, exhibitorList: true, exhibitorListWithLink: true, exhibitorListUrl: "https://example.com/list", visitorMessaging: true, preEventEmailSent: true, preEventEmailSentAt: date, postEventEmailSent: false, postEventEmailSentAt: null, createdById: "user-1", updatedById: "user-1", preEventEmailSentById: "user-1", postEventEmailSentById: null, ...dates, categoryIds: ["cat-1"], topicIds: ["topic-1"], sources: [{ id: "source-1", label: "Official", url: "https://example.com", lastChecked: date, priority: 1 }] }],
      companyFolders: [{ id: "folder-1", name: "ROV", normalizedName: "rov", color: "cyan", description: "Subsea", ...dates }],
      companies: [{ id: "company-1", name: "Example Company", normalizedName: "example company", website: "https://company.example", domain: "company.example", country: "Germany", countryCode: "DE", description: "Original company", priorityScore: 80, saved: true, createdById: "user-1", ...dates, categoryIds: ["cat-1"], topicIds: ["topic-1"],
        contacts: [{ id: "contact-1", firstName: "Alex", lastName: "Example", email: "alex@example.com", phone: null, whatsapp: null, jobTitle: "Director", department: null, linkedinUrl: null, notes: "Contact notes", isPrimary: true, ...dates }],
        notes: [note], socialLinks: [{ id: "social-1", platform: "LINKEDIN", url: "https://linkedin.com/company/example" }], folders: [{ folderId: "folder-1", createdAt: date }], exhibitions: [{ id: "link-1", exhibitionId: "expo-1", role: "EXHIBITOR", hall: "A", booth: "2", sourceUrl: null, notes: "Linked", createdAt: date }],
      }],
      media: [{ id: "media-1", name: "Energy Journal", normalizedName: "energy journal", identityKey: "energy-journal", websiteUrl: "https://media.example", domain: "media.example", sourceCategoryRaw: "Energy", countryCode: "DE", countryName: "Germany", publicationScopeRaw: "Global", description: "Journal", createdById: "user-1", ...dates, categoryIds: ["cat-1"], topicIds: ["topic-1"],
        contacts: [{ id: "media-contact-1", name: "Editor", roleLabel: "Technology Editor", department: null, email: "editor@example.com", phone: null, linkedInUrl: null, contactPageUrl: null, contactMethod: "EMAIL", notes: null, isPrimary: true, position: 0, sourceLabelRaw: "Editor", sourceValueRaw: "editor@example.com", sourceSheet: "Media", sourceRow: 2, importKey: "editor-1", ...dates }],
        notes: [{ ...note, id: "media-note-1" }], socialLinks: [], sources: [{ id: "media-source-1", importJobId: "media-job-1", sourceSheet: "Media", sourceRow: 2, rawValues: { Name: "Energy Journal", Email: "editor@example.com" }, warnings: [] }],
      }],
      administration: {
        users: [{ id: "user-1", username: "backup-user", role: "USER", isActive: true, mustChangePassword: false, lastLoginAt: date, permissions: ["VIEW_COMPANIES", "VIEW_MEDIA"], ...dates }],
        auditLogs: [{ id: "audit-1", actorUserId: "user-1", action: "COMPANY_CREATED", entityType: "COMPANY", entityId: "company-1", entityLabel: "Example Company", description: "Created company", metadata: { field: "name" }, createdAt: date }],
        companyImportJobs: [{ id: "company-job-1", fileName: "companies.xlsx", startedById: "user-1", startedAt: date, completedAt: date, status: "COMPLETED", totalRows: 1, validRows: 1, createdCompanies: 1, updatedCompanies: 0, createdContacts: 1, duplicates: 0, failedRows: 0, errorSummary: null }],
        mediaImportJobs: [{ id: "media-job-1", fileName: "media.xlsx", fileHash: "sample-file-digest", startedById: "user-1", startedAt: date, completedAt: date, status: "COMPLETED", report: { imported: 1 } }],
      },
    },
  };
}
