# Company folders

`/companies` opens a searchable, single-column folder list. Each folder has a color,
description and unique company count. All companies and Without a folder are
separate entry points. Existing company deep links remain supported.
Company lists offer 25, 50, 100 or All per page. All retains the folder, search,
filters and sort, resets to page one and removes the database row limit. Bulk
mutations remain limited to 100 selected companies per action.

Folders are independent of the shared industry categories and topics used by
Companies, Exhibitions and Media. A company can have multiple memberships, with a
composite database primary key preventing repeat memberships in the same folder.
Deleting a folder or removing a membership never deletes the company or its
contacts. Permanent company deletion remains a separate, confirmed operation.

Folder mutations require UPDATE_COMPANIES; folder browsing requires
VIEW_COMPANIES. Company creation and workbook import retain their existing
CREATE_COMPANIES and IMPORT_COMPANIES permissions. Writes use same-origin checks
and authenticated audit logs.

## Excel import

The existing Excel dialog now accepts a destination folder, defaulting to the open
folder. `descriptions` is recognized alongside `description`. Separate valid email
addresses in repeated rows or comma/semicolon/newline-separated cells are retained.
Existing populated company details are never overwritten by workbook import.

Only exact, non-conflicting identities are reused. Multiple domain matches, a shared
website with different names, conflicting countries/domains, or insufficient
name/country evidence are reported for review. They are not silently merged. The
preview and final result include row diagnostics. Separate workbook imports serialize
through a PostgreSQL advisory transaction lock, and each workbook's company,
contact, folder-link and completion writes are atomic. A failed job is retained for
diagnostics. Never delete existing records to make an ambiguous workbook match.

Actual source workbooks, local database exports and import reports are private and
ignored by Git. Publishing application code does not transfer imported local data to
production. Production imports require approval, a fresh verified backup and the
existing production procedure.

Administration JSON v2 includes Companies, folders, memberships, contacts, Media,
Exhibitions, Saved and safe administrative records. See [JSON-BACKUP.md](JSON-BACKUP.md)
for restore semantics and credential exclusions. Keep verified PostgreSQL dumps as
well for full disaster recovery, including account credentials.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run test:companies:db
npm run build
```

The database integration command is deliberately restricted to local
`iec_expobot` on `localhost:55432`. It creates uniquely owned synthetic fixtures
and removes only those fixture IDs, preserving imported user records.

The local helper `scripts/company-folders-local.ts` provides guarded `inspect`,
`backup`, `migrate`, `preview`, `import` and `verify` operations. It accepts the four
approved workbook filenames and creates their ROV Subsea, UXO, Loading Arms and USV
folders without copying private workbook contents into the repository.
